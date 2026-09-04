import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { AgentConversation, AgentConversationRole } from '../models';
import type { AgentConversationQuery } from '../types/agent';
import { lockMoveRequest, requireRequestParticipant } from './move-request-access.service';

// Only user-visible conversation roles; metadata may contain internal provider details.
export const publicConversationRoles = [AgentConversationRole.USER, AgentConversationRole.AGENT, AgentConversationRole.ADMIN];

export async function getRecentAgentConversations(id: string, transaction: Transaction): Promise<AgentConversation[]> {
  const messages = await AgentConversation.findAll({
    where: { moveRequestId: id, role: { [Op.in]: publicConversationRoles } },
    attributes: ['id', 'role', 'message', 'createdAt'],
    order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 20, transaction,
  });
  return messages.reverse();
}

export async function getAgentConversations(id: string, query: AgentConversationQuery) {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    await requireRequestParticipant(query.identity, request, transaction);
    const { count, rows } = await AgentConversation.findAndCountAll({
      where: { moveRequestId: id, role: { [Op.in]: publicConversationRoles } },
      attributes: ['id', 'role', 'message', 'createdAt'],
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      limit: query.limit, offset: (query.page - 1) * query.limit, transaction,
    });
    return { data: rows, pagination: { page: query.page, limit: query.limit, total: count, totalPages: Math.ceil(count / query.limit) } };
  });
}
