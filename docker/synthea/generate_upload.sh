#!/bin/bash
NUMBER_RECORDS=100
rm -rf /opt/output
echo "Generating $NUMBER_RECORDS records."
java -Djava.security.egd=file:/dev/./urandom -jar /opt/synthea-with-dependencies.jar -s $RANDOM -c /opt/synthea.properties -p $NUMBER_RECORDS "Minnesota" "Minneapolis"

echo "Done. Uploading data to the internal fhir server."

for rec in $(ls /opt/output/fhir/hospitalInformation*.json); do
    echo "Uploading $rec ..."
    curl http://fhir:8080/fhir --data-binary "@$rec" -H "Content-Type: application/fhir+json"
    rm $rec
done

for rec in $(ls /opt/output/fhir/practitionerInformation*.json); do
    echo "Uploading $rec ..."
    curl http://fhir:8080/fhir --data-binary "@$rec" -H "Content-Type: application/fhir+json"
    rm $rec
done

for rec in $(ls /opt/output/fhir/*.json); do
    echo "Uploading $rec ..."
    curl http://fhir:8080/fhir --data-binary "@$rec" -H "Content-Type: application/fhir+json"
done