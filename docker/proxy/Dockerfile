FROM node:22.8

WORKDIR /opt

ADD https://github.com/Evernorth/hl7-fhir-udap-common/archive/refs/heads/main.zip ./
COPY ./node-express ./app/node-express
COPY ./lib ./app/lib
COPY ./udap_pki ./app/udap_pki
COPY ./package.json ./app
COPY ./tenants.json ./app

RUN unzip main.zip
RUN mv hl7-fhir-udap-common-main hl7-fhir-udap-common
RUN cd ./hl7-fhir-udap-common && npm install
RUN cd ./app && npm install
RUN cd ./app/node-express && npm install

CMD [ "node", "./app/node-express/main.js" ]