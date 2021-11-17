import path from 'path'
import dotenv from 'dotenv'
dotenv.config({
  path: path.join(__dirname, '../.env'),
})

import archiver from 'archiver'
import bytes from 'bytes'
import { cleanEnv, str } from 'envalid'
import cliProgress, { Options, ValueType } from 'cli-progress'
// @ts-ignore
import fastFolderSize from 'fast-folder-size'
import fs from 'fs-extra'
import Docker from 'dockerode'
import { hideBin } from 'yargs/helpers'
import humanizeDuration from 'humanize-duration'
import log4js from 'log4js'
import moment from 'moment'
import { promisify } from 'util'
import yargs from 'yargs'

enum SERVICE_NAME {
  Jenkins = 'jenkins',
  Nexus = 'nexus',
}

enum CONTAINER_STATE {
  Created = 'created',
  Running = 'running',
  Paused = 'paused',
  Restarting = 'restarting',
  Removing = 'removing',
  Exited = 'exited',
  Dead = 'dead',
}

const fastFolderSizeAsync = promisify(fastFolderSize)
const env = cleanEnv(process.env, {
  CICD_JENKINS_VOLUME: str({
    desc: 'The path to where the Jenkins "jenkins_home" directory resides on the local filesystem.',
  }),
  CICD_NEXUS_VOLUME: str({
    desc: 'The path to where the Jenkins "nexus-data" directory resides on the local filesystem.',
  }),
  BACKUP_DIRECTORY: str({
    desc: 'The path to where the backup zips should be stored',
  }),
  LOG_LEVEL: str({
    default: 'info',
    choices: ['all', 'trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off'],
    desc: 'The most granular log level to output (all < trace < debug < info < warn < error < fatal < mark < off).',
  }),
  BACKUP_HISTORY_DIRECTORY: str({
    desc: 'path to where the backup zips should be stored with a unique date stamp for historical purposes',
    default: '',
  }),
})
const args = yargs(hideBin(process.argv)).options({
  service: {
    alias: 's',
    desc: 'The service to limit performing backups for',
    choices: [SERVICE_NAME.Jenkins, SERVICE_NAME.Nexus],
    demandOption: false,
    requiresArg: true,
  },
  skipDockerCheck: {
    alias: 'd',
    desc: 'Whether or not the status of the docker container for the service should be checked to see if still running',
    type: 'boolean',
    demandOption: false,
    requiresArg: false,
    default: false,
  },
}).argv
const logger = log4js
  .configure({
    appenders: {
      console: {
        type: 'console',
      },
    },
    categories: {
      default: {
        appenders: ['console'],
        level: env.LOG_LEVEL.toLowerCase(),
      },
    },
  })
  .getLogger('backup')

;(async () => {
  try {
    if (serviceIncluded(SERVICE_NAME.Nexus)) {
      await backup({
        containerName: 'cicd_nexus_1',
        volumePath: env.CICD_NEXUS_VOLUME,
      })
    }
    if (serviceIncluded(SERVICE_NAME.Jenkins)) {
      await backup({
        containerName: 'cicd_jenkins_1',
        volumePath: env.CICD_JENKINS_VOLUME,
      })
    }
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
})()

function serviceIncluded(service: SERVICE_NAME): boolean {
  const included =
    args.service === undefined ||
    args.service === service ||
    (Array.isArray(args.service) && args.service.includes(service))

  if (!included) {
    logger.debug(
      `Not including service '${service}' due to a '--service' flag present in command that does not include it`
    )
  }
  return included
}

async function backup({ containerName, volumePath }: { containerName: string; volumePath: string }): Promise<void> {
  logger.info(`Backing up container '${containerName}' with volume '${volumePath}' to '${env.BACKUP_DIRECTORY}'...`)
  await ensureContainerInState(containerName, CONTAINER_STATE.Exited)
  if (!(await fs.pathExists(volumePath))) {
    throw Error(`Volume path of '${volumePath}' does not exist.`)
  }
  const backupPath = path.join(env.BACKUP_DIRECTORY, `${path.basename(volumePath)}-backup.zip`)
  logger.debug(`Zipping directory '${volumePath}' to '${backupPath}'...`)
  await zipDirectory({
    sourcePath: volumePath,
    outputPath: backupPath,
  })
  if (env.BACKUP_HISTORY_DIRECTORY) {
    if (!(await fs.pathExists(env.BACKUP_HISTORY_DIRECTORY))) {
      throw Error(
        `Path '${env.BACKUP_HISTORY_DIRECTORY}' specified in BACKUP_HISTORY_DIRECTORY environment variable does not exist. Must be a valid directory or unset.`
      )
    }
    const historicalPath = path.join(
      env.BACKUP_HISTORY_DIRECTORY,
      `${path.basename(volumePath)}-backup-${moment().format('YYYY-MM-DD')}.zip`
    )
    logger.info(`Copying zip '${backupPath}' to '${historicalPath}' for historical purposes...`)
    await fs.copy(backupPath, historicalPath)
  } else {
    logger.debug('Skipping copy of historical zip due to absence of BACKUP_HISTORY_DIRECTORY environment variable.')
  }
}

function getDockerClient(): Docker {
  return new Docker()
}

async function getContainer(name: string): Promise<Docker.ContainerInfo | undefined> {
  try {
    await getDockerClient().ping()
  } catch (err) {
    throw Error(`Cannot communicate with docker. Make sure docker daemon is running. Error: '${JSON.stringify(err)}'`)
  }
  const containers = await getDockerClient().listContainers({
    all: true,
    filters: {
      name: [name],
    },
  })
  const containerMatches = containers.filter((cont) => cont.Names.includes(`/${name}`))
  if (containerMatches.length > 1) {
    throw Error(
      `Found multiple containers with name '${name}': '${JSON.stringify(containerMatches.map((cont) => cont.Names))}'`
    )
  } else {
    return containerMatches[0]
  }
}

async function ensureContainerInState(containerName: string, state: CONTAINER_STATE): Promise<void> {
  if (args.skipDockerCheck) {
    logger.trace('Not checking container state due to --skipDockerCheck flag')
  } else {
    const container = await getContainer(containerName)
    if (container && container.State !== state) {
      throw Error(
        `Container '${containerName}' state of '${container.State}' is not in the required state of '${state}'`
      )
    }
  }
}

async function zipDirectory({ sourcePath, outputPath }: { sourcePath: string; outputPath: string }): Promise<void> {
  const archive = archiver('zip', { zlib: { level: 9 } })
  const stream = fs.createWriteStream(outputPath)

  const totalSize = await fastFolderSizeAsync(sourcePath)
  const progressBar = new cliProgress.SingleBar(
    {
      format: ' {bar} {percentage}% | ETA: {eta_formatted} | {value}/{total}',
      formatValue: (value: number, options: Options, type: ValueType): string => {
        // padding
        function autopadding(value: number, length: number, options: Options) {
          return options && options.autopaddingChar
            ? (options.autopaddingChar + value).slice(-length).toString()
            : value.toString()
        }

        switch (type) {
          case 'percentage':
            return autopadding(value, 3, options)

          case 'total':
          case 'value':
            return bytes(value)

          default:
            return value.toString()
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      formatTime: (timeSecs: number, options: Options, roundToMultipleOf: number) => {
        return shortEnglishHumanizer(timeSecs * 1000, {
          largest: timeSecs < 60 ? 1 : 2,
          maxDecimalPoints: 1,
          spacer: '',
          delimiter: '',
        })
      },
    },
    cliProgress.Presets.shades_classic
  )
  progressBar.start(totalSize, 0)
  return new Promise((resolve, reject) => {
    archive
      .directory(sourcePath, false)
      .on('error', (err) => reject(err))
      .on('progress', (progress) => {
        progressBar.update(progress.fs.processedBytes)
      })
      .pipe(stream)

    stream.on('close', () => {
      progressBar.stop()
      resolve()
    })
    archive.finalize()
  })
}

const shortEnglishHumanizer = humanizeDuration.humanizer({
  language: 'shortEn',
  languages: {
    shortEn: {
      y: () => 'y',
      mo: () => 'mo',
      w: () => 'w',
      d: () => 'd',
      h: () => 'h',
      m: () => 'm',
      s: () => 's',
      ms: () => 'ms',
    },
  },
})
