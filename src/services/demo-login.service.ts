import { col, fn, where } from 'sequelize';
import { Admin, Resident } from '../models';
import { ApiError } from '../types/api';

// Identity lookup only: knowledge of an email does not authenticate its owner.
export async function loginByEmail(email: string) {
   console.log("resident 1st" )
  try{const condition = where(fn('lower', col('email')), email);
  const [residents, admins] = await Promise.all([
    Resident.findAll({ where: condition, attributes: ['id', 'name', 'email', 'communityId', 'unitId'], limit: 2 }),
    Admin.findAll({ where: condition, attributes: ['id', 'name', 'email', 'communityId'], limit: 2 }),
  ]);
    console.log("residents ",residents , "admins", admins )
  if (residents.length + admins.length > 1) {
    throw new ApiError(409, [{ field: 'email', message: 'Multiple accounts use this email. Please contact your community administrator.' }]);
  }
  const resident = residents[0];
  if (resident) return { id: resident.id, name: resident.name, email: resident.email,
    userType: 'RESIDENT' as const, communityId: resident.communityId, unitId: resident.unitId };
  const admin = admins[0];
  console.log("resident ,", resident , admin)
  if (admin) return { id: admin.id, name: admin.name, email: admin.email,
    userType: 'ADMIN' as const, communityId: admin.communityId };
  throw new ApiError(404, [{ field: 'email', message: 'No account found for this email.' }]);}
  catch(error){
    console.log("this is the error",error)
    throw error;
  }
}
