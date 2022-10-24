'use strict';
const axios = require('axios')
const querystring = require('querystring')
const { v4: uuidv4 } = require('uuid')

module.exports.matchHandler = async (requestBody) => {
  const matchedPatients = new Map()
  const matchParameters = getMatchParameters(JSON.parse(requestBody))
  var validationScore = 0
  console.log("Match Parameters: " + JSON.stringify(matchParameters))

  try {
    var minValidationLevel = -1
    if(matchParameters.resource.meta && matchParameters.resource.meta.profile && matchParameters.resource.meta.profile.includes('http://hl7.org/fhir/us/identity-matching/StructureDefinition/IDI-Patient')) {
      minValidationLevel = 0
    }
    else if(matchParameters.resource.meta && matchParameters.resource.meta.profile && matchParameters.resource.meta.profile.includes('http://hl7.org/fhir/us/identity-matching/StructureDefinition/IDI-Patient-L0')) {
      minValidationLevel = 1
    }
    else if(matchParameters.resource.meta && matchParameters.resource.meta.profile && matchParameters.resource.meta.profile.includes('http://hl7.org/fhir/us/identity-matching/StructureDefinition/IDI-Patient-L1')) {
      minValidationLevel = 2
    }
    else {
      var err = new Error("A patient matching profile must be supplied in patient.meta.profile.")
      err.validationScore = 0
      throw err
    }
    validationScore = validateMatchParameters(matchParameters.resource, minValidationLevel)
  }
  catch(e) {
    return {
      "statusCode": 400,
      "body": {"Error": e.message, "validationWeight": e.validationScore}
    }
  }

  //Get First/Last name.  This is more or less the basis of everything else.
  //Just for a match here there is no score.  We have to combine it with something else.
  if(matchParameters.resource.name) {
    for(var i=0; i<matchParameters.resource.name.length; i++) {
      var givenName = ""
      var familyName = matchParameters.resource.name[i].family ? matchParameters.resource.name[i].family : ""
      if(matchParameters.resource.name[i].given.constructor === Array) { //I really shouldn't have to do this. But i'm going to account for mistakes in the input.
        givenName = matchParameters.resource.name[i].given[0]
      }
      else {
        givenName = matchParameters.resource.name[i].given
      }
      const entries = await executeFhirSearch(querystring.stringify({"given": givenName, "family": familyName}))
      for(var j=0; j<entries.length; j++) {
        console.log("Matched patient " + entries[j].resource.id + " on name info.")
        const resultEntry = {
          "resource": entries[j].resource,
          "matched_on": ["name"]
        }
        matchedPatients.set(entries[j].resource.id, resultEntry)
      }
    }
  }

  //Get date of birth
  if(matchParameters.resource.birthDate) {
    const entries = await executeFhirSearch(querystring.stringify({"birthdate":matchParameters.resource.birthDate}))
    for(var i=0; i<entries.length; i++) {
      console.log("Matched patient " + entries[i].resource.id + " on birthdate.")
      const existingMatchedPatient = matchedPatients.get(entries[i].resource.id)
      if(existingMatchedPatient) {
        existingMatchedPatient.matched_on.push('birthDate')
        matchedPatients.set(entries[i].resource.id, existingMatchedPatient)
      }
    }
  }

  //Get sex assigned at birth, or the gender field.
  //Let's skip this for now.
  //Gender field is all I can search on right now.
  /*
  var inputGender = ""
  if(matchParameters.resource.extension) {
    const birthSex = matchParameters.resource.extension.filter(obj => {return obj.url == 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex'})
    if(birthSex.length > 0 && birthSex[0].valueCode == "M") {
      inputGender = "male"
    }
    else if (birthSex.length > 0 && birthSex[0].valueCode == "F") {
      inputGender = "female"
    }
  }

  if(matchParameters.resource.gender && !inputGender) {
    inputGender = matchParameters.resource.gender
  }

  if(inputGender) {
    const entries = await executeFhirSearch(querystring.stringify({"gender":inputGender}))
    for(var i=0; i<entries.length; i++) {
      console.log("Matched patient " + entries[i].resource.id + " on gender.")
      const existingMatchedPatient = matchedPatients.get(entries[i].resource.id)
      if(existingMatchedPatient) {
        existingMatchedPatient.matched_on.push('gender')
        matchedPatients.set(entries[i].resource.id, existingMatchedPatient)
      }
    }
  }
 */

 //Match on SSN/DL/PPN.
 if(matchParameters.resource.identifier) {
   const supportedIdentifiers = matchParameters.resource.identifier.filter(obj => {return (obj.system == 'http://standardhealthrecord.org/fhir/StructureDefinition/passportNumber' || obj.system == 'urn:oid:2.16.840.1.113883.4.3.25' || obj.system == 'http://hl7.org/fhir/sid/us-ssn')})
   for(var i=0; i<supportedIdentifiers.length; i++) {
     //const entries = await executeFhirSearch(querystring.stringify({"identifier": supportedIdentifiers[i].system + "|" + supportedIdentifiers[i].value}))
     const entries = await executeFhirSearch("identifier=" + supportedIdentifiers[i].system + "|" + supportedIdentifiers[i].value)
     for(var j=0; j<entries.length; j++) {
       console.log("Matched patient " + entries[j].resource.id + " on ID info.")

       const existingMatchedPatient = matchedPatients.get(entries[j].resource.id)
       if(existingMatchedPatient) {
         existingMatchedPatient.matched_on.push("ID")
         matchedPatients.set(entries[j].resource.id, existingMatchedPatient)
       }
     }

   }
 }

  //Get telephone and email (both are in the telecom fields.)
  if(matchParameters.resource.telecom) {
    //Loop through and match on any telephone number or email address.
    for(var i=0; i<matchParameters.resource.telecom.length; i++) {
      const entries = await executeFhirSearch(querystring.stringify({"telecom": matchParameters.resource.telecom[i].system + "|" + matchParameters.resource.telecom[i].value}))
      for(var j=0; j<entries.length; j++) {
        console.log("Matched patient " + entries[j].resource.id + " on telecom info.")

        const existingMatchedPatient = matchedPatients.get(entries[j].resource.id)
        if(existingMatchedPatient) {
          existingMatchedPatient.matched_on.push(matchParameters.resource.telecom[i].system)
          matchedPatients.set(entries[j].resource.id, existingMatchedPatient)
        }
      }
    }
  }

  //Get street Address
  //Get city
  if(matchParameters.resource.address) {
    for(var i=0; i<matchParameters.resource.address.length; i++) {
      const entries = await executeFhirSearch(querystring.stringify({"address": matchParameters.resource.address[i].line[0], "address-city": matchParameters.resource.address[i].city}))
      for(var j=0; j<entries.length; j++) {
        console.log("Matched patient " + entries[j].resource.id + " on address info.")
        const existingMatchedPatient = matchedPatients.get(entries[j].resource.id)
        if(existingMatchedPatient) {
          existingMatchedPatient.matched_on.push("address")
          matchedPatients.set(entries[j].resource.id, existingMatchedPatient)
        }
      }
    }
  }

  //Convert our hashtable/map into a single array, and add in the rest of the bundle stuff we need.
  var outputEntries = []
  matchedPatients.forEach(function(value, key) {
    //Compute our final score for the match.
    var matchScore = 0

    //Name + Date of birth is kind of the basis for everything. If we don't have that, then we'll say it's 0.
    //The entire array only has name matches in it- so we can assume that's done.
    if(value.matched_on.includes('birthDate')) {
      matchScore = 0.6

      if(value.matched_on.includes('phone')) {
        matchScore = 0.7
      }

      if(value.matched_on.includes('email') || value.matched_on.includes('address')) {
        matchScore = 0.8
      }
    }

    if(value.matched_on.includes('ID')) {
      matchScore = 0.99
    }

    //Only include the result if our confidence is high enough, and also stop at our requested limit.
    if((!matchParameters.onlyCertainMatches || matchScore >= 0.8) && (outputEntries.length < matchParameters.count)){
      outputEntries.push({
        "fullUrl": (process.env.FHIR_BASE + "/Patient/" + key),
        "resource": value.resource,
        "search": {
          "extension": [{
            "url": "http://hl7.org/fhir/StructureDefinition/match-grade",
            "valueCode": matchScore >= 0.8 ? "certain" : "possible"
          }],
          "mode": "match",
          "score": matchScore
        }
      })
    }
  })

  //Now our matchedPatients map has everything we need. Now we just need to format it in JSON and return it!
  const responseBundle = {
    "resourceType": "Bundle",
    "id": uuidv4(),
    "meta": {
      "lastUpdated": new Date().toISOString()
    },
    "type": "searchset",
    "total": outputEntries.length,
    "entry": outputEntries
  }

  //Output.
  return {
      //400 - Bad Request
      statusCode: 200,
      headers: {
        "x-weight-validation-value": validationScore,
        "Content-Type": "application/json",
      },
      body: responseBundle
  }
}

async function executeFhirSearch(searchQueryString) {
  const requestUrl = process.env.BACKEND_FHIR_SERVER + "/Patient?" + searchQueryString
  console.log("Performing FHIR Request: " + requestUrl)
  var fhirResult = await axios.request({
    'url': requestUrl,
    'method': 'GET'
  })
  if(fhirResult.data.entry) {
    console.log("Records found: " + fhirResult.data.entry.length)
    return fhirResult.data.entry
  }
  else {
    return []
  }
}

function getMatchParameters(requestBody) {
  var result = {
    "resource": "",
    "count": "",
    "onlyCertainMatches":""
  }
  for(var i=0; i<requestBody.parameter.length; i++) {
    if(requestBody.parameter[i].name == "resource") {
      result.resource = requestBody.parameter[i].resource
    }
    else if(requestBody.parameter[i].name == "count") {
      result.count = requestBody.parameter[i].valueInteger
    }
    else if(requestBody.parameter[i].name == "onlyCertainMatches") {
      result.onlyCertainMatches = (requestBody.parameter[i].valueBoolean == "true")
    }
  }
  return result
}

function validateMatchParameters(resource, minValidationLevel) {
  var overallScore = 0
  var idPPNScore = 0
  var idDLSTIDScore = 0
  var idOtherScore = 0
  var nameScore = 0
  var photoScore = 0
  var telecomScore = 0
  var addressScore = 0

  //First check the identifier
  if(resource.identifier) {
    for(var i=0; i<resource.identifier.length; i++) {
      if(resource.identifier[i].type && ["DL", "STID"].includes(resource.identifier[i].type.coding[0].code) && resource.identifier[i].value) {
        console.log("ID Found: " + resource.identifier[i].type.coding[0].code)
        idDLSTIDScore += 1
      }
      else if(resource.identifier[i].type && resource.identifier[i].type.coding[0].code == "PPN" && resource.identifier[i].value) {
        console.log("ID Found: " + resource.identifier[i].type.coding[0].code)
        idPPNScore += 1
      }
      else if(resource.identifier[i].value) {
        console.log("ID Found: " + resource.identifier[i].type.coding[0].code)
        idOtherScore += 1
      }
    }
  }

  //Check for Names
  if(resource.name) {
    for(var i=0; i<resource.name.length; i++) {
      //If neither name is given, we need to throw an error.
      if(!resource.name[i].given && !resource.name[i].family) {
        throw new Error("Condition idi-2 failed. A search was attempted with an empty name field.")
      }
      else if(resource.name[i].given && resource.name[i].family) {
        nameScore += 1
      }
    }
  }

  //Check for address, email, phone, photo.
  if(resource.photo) {
    photoScore += 1
  }
  if(resource.telecom) {
    for(var i=0; i<resource.telecom.length; i++) {
      if(resource.telecom[i].system == "email" && resource.telecom[i].value) {
        telecomScore += 1
      }
      else if(resource.telecom[i].system == "phone" && resource.telecom[i].value) {
        telecomScore += 1
      }
    }
  }
  if(resource.address) {
    for(var i=0; i<resource.address.length; i++) {
      if(resource.address[i].use == "home" && resource.address[i].line && resource.address[i].city) {
        addressScore += 1
      }
    }
  }

  //Compute our final results!
  if(idPPNScore > 0) {
    overallScore += 10
  }

  if(idDLSTIDScore > 0) {
    overallScore += 10
  }

  if(addressScore > 0 || telecomScore > 0 || photoScore > 0 || idOtherScore > 0) {
    overallScore += 4
  }

  if(nameScore > 0) {
    overallScore += 4
  }

  //Check for date of birthdate
  if(resource.birthDate) {
    overallScore += 2
  }

  //identifier.exists() or telecom.exists() or (name.family.exists() and name.given.exists()) or (address.line.exists() and address.city.exists()) or birthDate.exists()
  if(minValidationLevel == 0 && (idPPNScore == 0 && idDLSTIDScore == 0 && idOtherScore == 0 && telecomScore == 0 && nameScore == 0 && addressScore == 0 && !resource.birthDate)) {
    var e = new Error("Unauthorized Match - Input criteria doesn't meet minimum requirements.  Minimum required validation profile is IDI-Patient")
    e.validationScore = overallScore
    throw e
  }

  if(minValidationLevel == 1 && overallScore < 10) {
    var e = new Error("Unauthorized Match - Input criteria doesn't meet minimum requirements.  Minimum required validation profile is IDI-Patient-L0")
    e.validationScore = overallScore
    throw e
  }

  if(minValidationLevel == 2 && overallScore < 20) {
    var e = new Error("Unauthorized Match - Input criteria doesn't meet minimum requirements.  Minimum required validation profile is IDI-Patient-L1")
    e.validationScore = overallScore
    throw e
  }

  console.log("The final input validation score is: " + overallScore)
  console.log("ID PPN Score: " + idPPNScore)
  console.log("ID DL/STID Score: " + idDLSTIDScore)
  console.log("ID Other Score: " + idOtherScore)
  console.log("Name Score: " + nameScore)
  console.log("Photo Score: " + photoScore)
  console.log("Telecom Score: " + telecomScore)
  console.log("Address Score: " + addressScore)
  return overallScore
}

//PER IG- the logic for input validation is:
/*Combined weighted values of included elements must have a minimum value of 10 (see Patient Weighted Elements table):
(
  (
    (
      identifier.type.coding.exists(code = 'PPN') and
      identifier.value.exists()
    ).toInteger()*10
  ) +
  (
    (
      identifier.type.coding.exists(code = 'DL' or code = 'STID') and
      identifier.value.exists()
    ).toInteger()*10
  ) +

  (
    (
      (
        address.exists(use = 'home') and
        address.line.exists() and
        address.city.exists()
      ) or
      (
        identifier.type.coding.exists(code != 'PPN' and code != 'DL' and code != 'STID') //WE DONT CARE ABOUT THE VALUE??
      ) or
      (
        (
          telecom.exists(system = 'email') and
          telecom.value.exists()
        ) or
        (
          telecom.exists(system = 'phone') and
          telecom.value.exists()
        )
      ) or
      (
        photo.exists()
      )
    ).toInteger() * 4
  ) +

  (
    (
      name.family.exists() and
      name.given.exists()
    ).toInteger()*4
  ) +

  (
    birthDate.exists().toInteger()*2
  )

) >= 10
*/
