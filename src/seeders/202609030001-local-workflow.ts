import { seedDevelopmentData, revertDevelopmentData } from './development-data';

export async function up(): Promise<void> {
  await seedDevelopmentData();
}

export async function down(): Promise<void> {
  await revertDevelopmentData();
}
