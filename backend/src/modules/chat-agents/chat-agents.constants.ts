import { Role } from '../../common/enums/roles.enum';
import {
  AGENT_STATUSES,
  EFFORT_LABELS,
  EFFORT_LEVELS,
  KNOWLEDGE_MODES,
  LEAD_CAPTURE_MODES,
  LEAD_FIELDS,
  MODELS,
  RESPONSE_LENGTHS,
  TONES,
} from './chat-agent-models';

/**
 * Who may CONFIGURE chatbots (create, edit, train, knowledge, flow) and READ
 * the recorded conversations. Admin only — every train and test call spends
 * real money, and the inbox holds what testers typed.
 *
 * Every signed-in account (admin AND user) may LIST active chatbots and chat
 * with them — that is `CHAT_USER_ROLES`.
 */
export const CHAT_AGENT_ROLES = [Role.ADMIN] as const;
export const CHAT_USER_ROLES = [Role.ADMIN, Role.USER] as const;

export const CHAT_AGENT_OPTIONS = {
  models: MODELS.map((m) => ({
    id: m.id,
    tier: m.tier,
    label: m.label,
    modelName: m.modelName,
    description: m.description,
    contextWindow: m.contextWindow,
  })),
  effortLevels: EFFORT_LEVELS.map((value) => ({ value, label: EFFORT_LABELS[value] })),
  tones: [...TONES],
  responseLengths: [...RESPONSE_LENGTHS],
  knowledgeModes: [...KNOWLEDGE_MODES],
  leadCaptureModes: [...LEAD_CAPTURE_MODES],
  leadFields: [...LEAD_FIELDS],
  statuses: [...AGENT_STATUSES],
};
