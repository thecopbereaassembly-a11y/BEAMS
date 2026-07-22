/**
 * Public surface of the membership module. Other modules import ONLY from here —
 * never from a deep path (docs/03 §5). This is the seam that keeps 24 modules
 * decoupled.
 */
export {
  listMembers,
  getMember,
  createMember,
  updateMember,
  deleteMember,
  restoreMember,
  memberStatusCounts,
  displayName,
  ageFrom,
  normalizeGhanaPhone,
} from "./services/membership.service";

export type { Member } from "./repositories/member.repository";

export {
  memberFormSchema,
  memberListQuerySchema,
  MEMBER_STATES,
  STATUS_LABELS,
} from "./schemas/member.schema";

export type {
  MemberFormValues,
  MemberListQuery,
} from "./schemas/member.schema";
