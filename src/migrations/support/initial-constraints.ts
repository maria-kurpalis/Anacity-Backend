import type { QueryInterface, Transaction } from 'sequelize';

// Historical migration DDL shared with the development-only reset.
// Preserve these definitions; schema changes belong in new migrations.

export async function addResidentMembershipConstraint(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.sequelize.query(
    'ALTER TABLE "residents" ADD CONSTRAINT "residents_unit_community_fk" '
    + 'FOREIGN KEY ("unitId", "communityId") REFERENCES "units" ("id", "communityId") '
    + 'ON UPDATE NO ACTION ON DELETE NO ACTION',
    { transaction },
  );
}

export async function addMoveRequestMembershipConstraints(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.sequelize.query(
    'ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_unit_community_fk" '
    + 'FOREIGN KEY ("unitId", "communityId") REFERENCES "units" ("id", "communityId") '
    + 'ON UPDATE NO ACTION ON DELETE NO ACTION',
    { transaction },
  );
  await queryInterface.sequelize.query(
    'ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_resident_community_unit_fk" '
    + 'FOREIGN KEY ("residentId", "communityId", "unitId") REFERENCES "residents" ("id", "communityId", "unitId") '
    + 'ON UPDATE NO ACTION ON DELETE NO ACTION',
    { transaction },
  );
  await queryInterface.sequelize.query(
    'ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_reviewer_community_fk" '
    + 'FOREIGN KEY ("reviewedBy", "communityId") REFERENCES "admins" ("id", "communityId") '
    + 'ON UPDATE NO ACTION ON DELETE NO ACTION',
    { transaction },
  );
}

export async function addRequestDetailsCountChecks(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.sequelize.query(
    'ALTER TABLE "move_request_details" ADD CONSTRAINT "move_request_details_vehicle_count_nonnegative" CHECK ("vehicleCount" >= 0)',
    { transaction },
  );
  await queryInterface.sequelize.query(
    'ALTER TABLE "move_request_details" ADD CONSTRAINT "move_request_details_occupant_count_nonnegative" CHECK ("occupantCount" >= 0)',
    { transaction },
  );
}

export async function addAuditLogAppendOnly(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.sequelize.query(`
    CREATE FUNCTION reject_audit_logs_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = '55000';
    END;
    $$;
  `, { transaction });
  await queryInterface.sequelize.query(
    'CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE OR TRUNCATE '
    + 'ON "audit_logs" FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_logs_mutation()',
    { transaction },
  );
}

export async function addStatusHistoryAppendOnly(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.sequelize.query(`
    CREATE FUNCTION reject_status_histories_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'status_histories is append-only' USING ERRCODE = '55000';
    END;
    $$;
  `, { transaction });
  await queryInterface.sequelize.query(
    'CREATE TRIGGER status_histories_append_only BEFORE UPDATE OR DELETE OR TRUNCATE '
    + 'ON "status_histories" FOR EACH STATEMENT EXECUTE FUNCTION reject_status_histories_mutation()',
    { transaction },
  );
}
