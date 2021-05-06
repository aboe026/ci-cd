import path from 'path'
import dotenv from 'dotenv'
dotenv.config({
  path: path.join(__dirname, '../.env'),
})

import archiver from 'archiver'
import { cleanEnv, str } from 'envalid'
import fs from 'fs-extra'
import Docker from 'dockerode'
import { hideBin } from 'yargs/helpers'
import log4js from 'log4js'
import yargs from 'yargs'

enum SERVICE_NAME {
  Jenkins = 'jenkins',
  Nexus = 'nexus',
}

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
})
const args = yargs(hideBin(process.argv)).options({
  service: {
    alias: 's',
    desc: 'The service to limit performing backups for',
    choices: [SERVICE_NAME.Jenkins, SERVICE_NAME.Nexus],
    demandOption: false,
    requiresArg: true,
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
  const container = await getContainer(containerName)
  if (container && container.State !== CONTAINER_STATE.Exited) {
    throw Error(
      `Container '${containerName}' state of '${container.State}' is not in the required state of '${CONTAINER_STATE.Exited}'`
    )
  }
  if (!(await fs.pathExists(volumePath))) {
    throw Error(`Volume path of '${volumePath}' does not exist.`)
  }
  const destination = path.join(env.BACKUP_DIRECTORY, `${path.basename(volumePath)}-backup.zip`)
  logger.debug(`Zipping directory '${volumePath}' to '${destination}'...`)
  await zipDirectory({
    sourcePath: volumePath,
    outputPath: destination,
  })
}

function getDockerClient(): Docker {
  return new Docker()
}

async function getContainer(name: string): Promise<Docker.ContainerInfo | undefined> {
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

async function zipDirectory({ sourcePath, outputPath }: { sourcePath: string; outputPath: string }): Promise<void> {
  const archive = archiver('zip', { zlib: { level: 9 } })
  const stream = fs.createWriteStream(outputPath)

  return new Promise((resolve, reject) => {
    archive
      .directory(sourcePath, false)
      .on('error', (err) => reject(err))
      .pipe(stream)

    stream.on('close', () => resolve())
    archive.finalize()
  })
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
