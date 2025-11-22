ARG VARIANT=latest
FROM oven/bun:${VARIANT}

RUN apt-get update \
  && apt-get -y install --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    unzip \
    sudo \
    xvfb \
    vim \
    git \
  && chsh -s $(which bash) bun \
  && echo 'export PS1="\e[01;32m\u\e[m:\e[01;34m\w\e[m\$ "' >> /home/bun/.bashrc \
  && echo "bun ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

RUN bunx playwright install-deps

USER bun
