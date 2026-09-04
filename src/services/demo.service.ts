import { Admin, Resident } from '../models';

// Local demo directory only. Identities come from the database, not UI constants.
export async function getDemoIdentities() {
  const include = [{ association: 'community', attributes: ['id', 'name'], where: { isActive: true } }];
  const residents = await Resident.findAll({ where: { isActive: true }, attributes: ['id', 'name'],
    include: [...include, { association: 'unit', attributes: ['unitNumber'] }], order: [['name', 'ASC']], limit: 100 });
  const admins = await Admin.findAll({ where: { isActive: true }, attributes: ['id', 'name'], include, order: [['name', 'ASC']], limit: 100 });
  return { residents, admins };
}
