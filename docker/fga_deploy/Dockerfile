FROM node:22.8

WORKDIR /opt

COPY ./fga_deploy ./fga_deploy

RUN cd ./fga_deploy && npm install

CMD [ "/bin/bash" ]