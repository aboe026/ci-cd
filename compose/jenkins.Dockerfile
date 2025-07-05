FROM jenkins/jenkins:2.504.3-lts

USER root

RUN apt update && curl -fsSL https://get.docker.com | sh
RUN usermod -aG docker jenkins
