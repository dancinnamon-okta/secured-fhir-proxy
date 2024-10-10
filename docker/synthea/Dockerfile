FROM openjdk:11


WORKDIR /opt
ADD https://github.com/synthetichealth/synthea/releases/download/master-branch-latest/synthea-with-dependencies.jar ./
COPY ./docker/synthea/generate_upload.sh ./
COPY ./docker/synthea/synthea.properties ./

CMD [ "/bin/bash" ]