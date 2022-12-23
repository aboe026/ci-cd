# ci-cd

Continuous Integration/Continuous Deployment environment and scripts

---

## Environment variables

This project expects the following environment variables to be defined:

- `CICD_JENKINS_VOLUME` - The path to where the Jenkins `jenkins_home` directory resides on the local filesystem.
- `CICD_NEXUS_VOLUME` - The path to where the Jenkins `nexus-data` directory resides on the local filesystem.
- `BACKUP_DIRECTORY` - The path to where backup zips should be stored (only needed when running [backups](#run))

---

## Environment

Contains docker images for the following softwares:

- [Jenkins](https://www.jenkins.io/) - CI/CD tool used to build and deploy software
- [Sonatype Nexus](https://www.sonatype.com/products/repository-oss) - Repository tool used to store built artifacts

### Build

To build the docker images for the environments, run:

```sh
npm run build
```

### Start

The firt time brining the environment up, run:

```sh
npm run create
```

Subsequently, run:

```sh
npm run start
```

### Stop

To stop the containers for the environment, run:

```sh
npm run stop
```

### Upgrade

1. Update image tag references for [nexus](./compose/docker-compose.yaml) and [jenkins](./compose/jenkins.Dockerfile)

   - Optionall change tags to `latest` and `lts` respectively to and pull to automatically get latest

2. Create containers again with `npm run create`

---

## Backups

### Install Dependencies

The backup operation requires [npm](https://www.npmjs.com/) dependencies to execute. To install those depencencies, run:

```sh
npm install
```

### Run

To create backups for the environment volumes, run:

```sh
npm run backup
```

optionally specifying a specific service to backup:

```sh
npm run backup -- --service=nexus
```
