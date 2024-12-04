FROM jenkins/jenkins:2.479.2-lts

USER root

RUN apt update && curl -fsSL https://get.docker.com | sh
RUN usermod -aG docker jenkins
