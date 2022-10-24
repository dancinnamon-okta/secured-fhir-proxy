'use strict';

//This will be used to advertise a SMART v1 AND a SMART v2 server!
module.exports.getSMARTConfiguration = (tenantConfig) => {
  return {
    "authorization_endpoint": tenantConfig.authorize_endpoint,
    "token_endpoint": tenantConfig.token_endpoint,
    "token_endpoint_auth_methods_supported": ["client_secret_basic"],
    "registration_endpoint": tenantConfig.registration_endpoint,
    "scopes_supported": ["openid", "email", "fhirUser", "profile", "launch", "launch/patient", "patient/*.*", "user/*.*", "offline_access"],
    "response_types_supported": ["code"],
    "introspection_endpoint": tenantConfig.introspect_endpoint,
    "revocation_endpoint": tenantConfig.revoke_endpoint,
    "capabilities": ["launch-standalone", "launch-ehr", "client-public", "client-confidential-symmetric", "sso-openid-connect", "context-standalone-patient"],
    "code_challenge_methods_supported": ["S256"]
  }
}

//This is only needed for SMART v1.
module.exports.getLegacyConfiguration = (tenantConfig) => {
	var d = new Date();
	return {
		"resourceType" : "CapabilityStatement",
		"id" : "okta_smart-app-launch-example",
		"name" : "SMART App Launch Capability Statement Example w/Okta as OAuth2 AS",
		"status" : "active",
		"experimental" : true,
		"date" : d.toISOString(),
		"publisher" : "Okta",
		"contact" : [
		{
		  "telecom" : [
			{
			  "system" : "url",
			  "value" : "https://okta.com"
			}
		  ]
		}
		],
		"description" : "This is an example implementation of the SMART launch framework using Okta as the identity and authorization platform.",
		"kind" : "capability",
		"software" : {
			"name" : "Okta SMART FHIR Demo"
		},
		"fhirVersion" : "4.0.1",
		"format" : [
			"xml",
			"json"
		],
		"rest" : [
		{
		  "mode" : "server",
		  "documentation" : "This is an example implementation of the SMART launch framework using Okta as the identity and authorization platform.",
		  "security" : {
			"extension" : [
			  {
				"extension" : [
				  {
					"url" : "token",
					"valueUri" : tenantConfig.token_endpoint
				  },
				  {
					"url" : "authorize",
					"valueUri" : tenantConfig.authorize_endpoint
				  },

				  {
					"url" : "introspect",
					"valueUri" : tenantConfig.introspect_endpoint
				  },
				  {
					"url" : "revoke",
					"valueUri" : tenantConfig.revoke_endpoint
				  },
				  {
					"url" : "register",
					"valueUri" : tenantConfig.registration_endpoint
				  }
				],
				"url" : "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris"
			  }
			],
			"service" : [
			  {
				"coding" : [
				  {
					"system" : "http://hl7.org/fhir/restful-security-service",
					"code" : "SMART-on-FHIR"
				  }
				],
				"text" : "OAuth2 using SMART-on-FHIR profile (see http://docs.smarthealthit.org)"
			  }
			]
		  }
		}
		]
	}
}
