'use strict';
const axios = require('axios')

var compartmentDefinitions = {
    "Patient": null,
    "Practitioner": null,
    "RelatedPerson": null
}

async function getDefinition(tenantConfig, compartmentType) {
    var definitionUrl = null
    if(compartmentType === 'Patient') {
        definitionUrl = tenantConfig.patient_compartment_url
    }
    else if(compartmentType === 'Practitioner') {
        definitionUrl = tenantConfig.practitioner_compartment_url
    }
    else if(compartmentType === 'RelatedPerson') {
        definitionUrl = tenantConfig.related_person_compartment_url
    }
    else {
        return null
    }
    console.log(`Loading compartment definition for type: ${compartmentType}`)
    var compartmentResult = await axios.request({
        'url': definitionUrl,
        'method': 'GET',
    })
    return compartmentResult.data
}

module.exports.getLinkedPrincipals = async (tenantConfig, securityPrincipalType, fhirObject) => {
    //Given the FHIR Object, look up it's definition in the applicable compartment.
    if(!compartmentDefinitions[securityPrincipalType]) {
        compartmentDefinitions[securityPrincipalType] = await getDefinition(tenantConfig, securityPrincipalType)
    }
    console.log(`Checking with the ${securityPrincipalType} compartment...`)
    const definition = compartmentDefinitions[securityPrincipalType]
    
    const resource = definition.resource.filter((resource) => resource.code == fhirObject.resourceType && resource.param)
    
    if(resource.length == 1) {
        //We now know which FHIR type we're dealing with- now let's get the linked attributes per the compartment defintion.
        return resource[0].param.map((param) => fhirObject[param] && fhirObject[param].reference ? fhirObject[param].reference : '')
    }
    else {
        return []
    }
}

