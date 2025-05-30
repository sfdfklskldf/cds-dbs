const cds = require('@sap/cds')

module.exports = class AdminService extends cds.ApplicationService {
  init() {
    this.before('NEW', 'Authors', genid)
    this.before('NEW', 'Books', genid)
    return super.init()
  }
}

/** Generate primary keys for target entity in request */
async function genid(req) {
  const { ID } = await SELECT.one.from(req.target).columns('max(ID) as ID')
  req.data.ID = ID - (ID % 100) + 100 + 1
}
