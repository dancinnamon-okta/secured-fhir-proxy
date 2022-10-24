const fs = require('fs')
const path = require("path")

module.exports.getTenantConfig = (tenantId) => {
  let configData = JSON.parse(fs.readFileSync(path.resolve(process.env.LAMBDA_TASK_ROOT, "tenants.json")))
  let foundConfig = configData.filter(config => config.id === tenantId)
  if(foundConfig.length > 0) {
    return foundConfig[0]
  }
  else {
    return {}
  }
}
