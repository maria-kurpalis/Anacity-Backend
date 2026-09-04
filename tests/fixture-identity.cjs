// Existing workflow tests operate on fixture-owned requests. Supply their demo
// identity explicitly at the HTTP boundary. Authorization tests use raw fetch
// with missing/wrong headers instead of this convenience helper.
async function fixtureIdentity(path) {
  const { MoveRequest, Admin } = require('../dist/models');
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const requestId = path.match(new RegExp(`^/(?:admin/)?move-requests/(${uuid})(?:[/?]|$)`, 'i'))?.[1];
  const request = requestId ? await MoveRequest.findByPk(requestId) : null;
  if (!path.startsWith('/admin/')) return request ? { 'X-Resident-Id': request.residentId } : {};
  const communityId = path.match(new RegExp(`^/admin/communities/(${uuid})/`, 'i'))?.[1] ?? request?.communityId;
  const admin = communityId ? await Admin.findOne({ where: { communityId } }) : null;
  return admin ? { 'X-Admin-Id': admin.id } : {};
}
module.exports = { fixtureIdentity };
