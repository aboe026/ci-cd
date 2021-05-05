# ci-cd

Continuous Integration/Continuous Deployment environment and scripts

## Environment variables

This project expects the following environment variables to be defined:

- `CICD_JENKINS_VOLUME` - The path to where the Jenkins `jenkins_home` directory should reside on the local filesystem.
- `CICD_NEXUS_VOLUME` - The path to where the Jenkins `nexus-data` directory should reside on the local filesystem.

## Environment

Contains docker images for the following softwares:

- [Jenkins](https://www.jenkins.io/) - CI/CD tool used to build and deploy software
- [Sonatype Nexus](https://www.sonatype.com/products/repository-oss) - Repository tool used to store built artifacts

### Build

To build the docker images for the environments, run:

```sh
cd compose
docker-compose build
```

### Start

To start the containers for the environment, run:

```sh
cd compose
docker-compose up -d
```

### Stop

To stop the containers for the environment, run:

```sh
cd compose
docker-compose down
```
