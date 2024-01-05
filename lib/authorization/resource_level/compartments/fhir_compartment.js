'use strict';
const fs = require('fs')
const path = require('path')

//Cache of the compartment definitions so I'm not loading them every time.
var compartmentDefinitions = []

//Load up a given compartment definition if called upon.
function getDefinitionsForTenant(tenantConfig) {
    const compartmentData = compartmentDefinitions.filter((definition) => definition.tenant_id == tenantConfig.id)

    if(compartmentData.length == 0) {
        console.log(`Loading compartment definitions for tenant: ${tenantConfig.id}`)

        var tenantCompartmentDefinition = {
            "tenant_id": tenantConfig.id,
            "Patient": null,
            "Practitioner": null,
            "RelatedPerson": null
        }

        const patientCompartmentFile = path.resolve(process.env.LAMBDA_TASK_ROOT, tenantConfig.patient_compartment_file)
        const practitionerCompartmentFile = path.resolve(process.env.LAMBDA_TASK_ROOT, tenantConfig.practitioner_compartment_file)
        const relatedPersonCompartmentFile = path.resolve(process.env.LAMBDA_TASK_ROOT, tenantConfig.related_person_compartment_file)

        if (fs.existsSync(patientCompartmentFile)) {
            tenantCompartmentDefinition.Patient = JSON.parse(fs.readFileSync(patientCompartmentFile))
        }
        if (fs.existsSync(practitionerCompartmentFile)) {
            tenantCompartmentDefinition.Practitioner = JSON.parse(fs.readFileSync(practitionerCompartmentFile))
        }
        if (fs.existsSync(relatedPersonCompartmentFile)) {
            tenantCompartmentDefinition.RelatedPerson = JSON.parse(fs.readFileSync(relatedPersonCompartmentFile))
        }
        compartmentDefinitions.push(tenantCompartmentDefinition)
        return tenantCompartmentDefinition
    }
    

    return compartmentData[0]
}

//This function will take in an object, a string, and it will return the value at that path, if it exists.
//Example: if the "path" is "subject.reference" it will return back that path within the FHIR object.
function getValueByPathString(obj, path) {
    const parts = path.split(".");

    if(!obj[parts[0]]) {
        return ''
    }

    else if (parts.length===1){
        return obj && obj.hasOwnProperty(parts[0]) ? obj[parts[0]] : '';
    }

    else if(Array.isArray(obj[parts[0]])) {
      return obj[parts[0]].map((item) => getValueByPathString(item, parts.slice(1).join("."))).flat()
    }
    
    else {
        return getValueByPathString(obj[parts[0]], parts.slice(1).join("."));
    }
}

module.exports.getLinkedPrincipals = async (tenantConfig, securityPrincipalType, fhirObject) => {
    //Given the FHIR Object, look up it's definition in the applicable compartment.
    console.log(`Checking with the ${securityPrincipalType} compartment...`)
    const compartmentDefinition = getDefinitionsForTenant(tenantConfig)[securityPrincipalType]

    const resourceMapping = compartmentDefinition.filter((resource) => resource.resourceType == fhirObject.resourceType)
    
    if(resourceMapping.length == 1) {
        console.log(resourceMapping[0].linkPaths)
        //We now know which FHIR type we're dealing with- now let's get the linked attributes per the compartment defintion.
        return resourceMapping[0].linkPaths.map((linkPath) => getValueByPathString(fhirObject, linkPath)).flat()
    }
    else {
        return []
    }
}

