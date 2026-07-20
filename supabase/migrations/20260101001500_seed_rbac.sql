-- ============================================================================
-- BEAMS · 96 · RBAC seed — permission catalog, roles, and default grants.
-- Idempotent (on conflict do nothing). Defaults use assembly_id = NULL.
-- ============================================================================

-- ---- Permissions ------------------------------------------------------------
insert into permission (key, module, action, is_sensitive, description) values
 ('dashboard.view','dashboard','view',false,'View dashboard'),
 ('member.read','membership','read',false,'Read all members'),
 ('member.write','membership','write',false,'Create/update members'),
 ('member.delete','membership','delete',false,'Soft-delete/restore members'),
 ('member.export','membership','export',false,'Export member data'),
 ('family.read','families','read',false,'Read families'),
 ('family.write','families','write',false,'Create/update families'),
 ('homecell.read','home_cells','read',false,'Read home cells'),
 ('homecell.write','home_cells','write',false,'Manage home cells'),
 ('ministry.read','ministries','read',false,'Read ministries'),
 ('ministry.write','ministries','write',false,'Manage ministries'),
 ('leadership.read','leadership','read',false,'Read leadership'),
 ('leadership.write','leadership','write',false,'Manage leadership'),
 ('visitor.read','visitors','read',false,'Read visitors'),
 ('visitor.write','visitors','write',false,'Manage visitors'),
 ('attendance.read','attendance','read',false,'Read attendance'),
 ('attendance.write','attendance','write',false,'Capture attendance'),
 ('shepherding.read','shepherding','read',false,'Read follow-ups'),
 ('shepherding.write','shepherding','write',false,'Manage follow-ups'),
 ('counselling.read','counselling','read',true,'Read confidential counselling'),
 ('counselling.write','counselling','write',true,'Manage confidential counselling'),
 ('welfare.read','welfare','read',true,'Read confidential welfare'),
 ('welfare.write','welfare','write',true,'Manage confidential welfare'),
 ('evangelism.read','evangelism','read',false,'Read evangelism'),
 ('evangelism.write','evangelism','write',false,'Manage evangelism'),
 ('event.read','events','read',false,'Read events'),
 ('event.write','events','write',false,'Manage events'),
 ('prayer.read','prayer','read',false,'Read prayer requests'),
 ('prayer.write','prayer','write',false,'Create/update prayer requests'),
 ('finance.read','finance','read',true,'Read finance'),
 ('finance.write','finance','write',true,'Manage finance'),
 ('finance.export','finance','export',true,'Export finance'),
 ('communication.read','communication','read',false,'Read communications'),
 ('communication.write','communication','write',false,'Send communications'),
 ('document.read','documents','read',false,'Read documents'),
 ('document.write','documents','write',false,'Manage documents'),
 ('asset.read','assets','read',false,'Read assets'),
 ('asset.write','assets','write',false,'Manage assets'),
 ('report.read','reports','read',false,'Run reports'),
 ('report.write','reports','write',false,'Create/schedule reports'),
 ('report.export','reports','export',false,'Export reports'),
 ('settings.read','settings','read',false,'Read settings'),
 ('settings.write','settings','write',false,'Change settings'),
 ('user.manage','user_management','manage',true,'Manage users & assignments'),
 ('role.manage','user_management','manage',true,'Manage roles & permissions'),
 ('audit.read','audit','read',true,'Read audit logs'),
 ('assistant.use','ai_assistant','use',false,'Use AI assistant')
on conflict (key) do nothing;

-- ---- Roles ------------------------------------------------------------------
insert into role (key, name, rank, is_system, is_assignable, description) values
 ('super_admin','Super Administrator',10,true,true,'Platform owner; full access'),
 ('district_pastor','District Pastor',20,true,true,'Oversight & pastoral care'),
 ('presiding_elder','Presiding Elder',30,true,true,'Full assembly administrator'),
 ('elder','Elder',40,true,true,'Broad ministry operations'),
 ('deacon','Deacon',50,true,true,'Member care, welfare, attendance'),
 ('deaconess','Deaconess',50,true,true,'Member care, welfare, attendance'),
 ('secretary','Secretary',55,true,true,'Records, events, communication'),
 ('financial_secretary','Financial Secretary',55,true,true,'Finance officer'),
 ('ministry_leader','Ministry Leader',60,true,true,'Leads a ministry'),
 ('home_cell_leader','Home Cell Leader',60,true,true,'Leads a home cell'),
 ('media_team','Media Team',70,true,true,'Media, documents, communication'),
 ('church_worker','Church Worker',80,true,true,'General assistance'),
 ('member','Member',90,true,true,'Self-service member'),
 ('auditor','Read-only Auditor',100,true,true,'Read-only across the system')
on conflict (key) do nothing;

-- ---- Default grants ---------------------------------------------------------
-- super_admin: every permission.
insert into role_permission (role_id, permission_id, assembly_id, is_granted)
select r.id, p.id, null, true
from role r cross join permission p
where r.key = 'super_admin'
on conflict do nothing;

-- All other roles: explicit (role_key, permission_key) pairs.
with grants(role_key, perm_key) as (
  values
  -- District Pastor
  ('district_pastor','dashboard.view'),('district_pastor','member.read'),
  ('district_pastor','member.export'),('district_pastor','family.read'),
  ('district_pastor','homecell.read'),('district_pastor','ministry.read'),
  ('district_pastor','leadership.read'),('district_pastor','visitor.read'),
  ('district_pastor','attendance.read'),('district_pastor','shepherding.read'),
  ('district_pastor','shepherding.write'),('district_pastor','counselling.read'),
  ('district_pastor','counselling.write'),('district_pastor','welfare.read'),
  ('district_pastor','welfare.write'),('district_pastor','evangelism.read'),
  ('district_pastor','event.read'),('district_pastor','prayer.read'),
  ('district_pastor','prayer.write'),('district_pastor','finance.read'),
  ('district_pastor','finance.export'),('district_pastor','communication.read'),
  ('district_pastor','communication.write'),('district_pastor','document.read'),
  ('district_pastor','report.read'),('district_pastor','report.write'),
  ('district_pastor','report.export'),('district_pastor','audit.read'),

  -- Presiding Elder (full assembly admin)
  ('presiding_elder','dashboard.view'),('presiding_elder','member.read'),
  ('presiding_elder','member.write'),('presiding_elder','member.delete'),
  ('presiding_elder','member.export'),('presiding_elder','family.read'),
  ('presiding_elder','family.write'),('presiding_elder','homecell.read'),
  ('presiding_elder','homecell.write'),('presiding_elder','ministry.read'),
  ('presiding_elder','ministry.write'),('presiding_elder','leadership.read'),
  ('presiding_elder','leadership.write'),('presiding_elder','visitor.read'),
  ('presiding_elder','visitor.write'),('presiding_elder','attendance.read'),
  ('presiding_elder','attendance.write'),('presiding_elder','shepherding.read'),
  ('presiding_elder','shepherding.write'),('presiding_elder','counselling.read'),
  ('presiding_elder','counselling.write'),('presiding_elder','welfare.read'),
  ('presiding_elder','welfare.write'),('presiding_elder','evangelism.read'),
  ('presiding_elder','evangelism.write'),('presiding_elder','event.read'),
  ('presiding_elder','event.write'),('presiding_elder','prayer.read'),
  ('presiding_elder','prayer.write'),('presiding_elder','finance.read'),
  ('presiding_elder','finance.export'),('presiding_elder','communication.read'),
  ('presiding_elder','communication.write'),('presiding_elder','document.read'),
  ('presiding_elder','document.write'),('presiding_elder','asset.read'),
  ('presiding_elder','asset.write'),('presiding_elder','report.read'),
  ('presiding_elder','report.write'),('presiding_elder','report.export'),
  ('presiding_elder','settings.read'),('presiding_elder','settings.write'),
  ('presiding_elder','user.manage'),('presiding_elder','audit.read'),

  -- Elder
  ('elder','dashboard.view'),('elder','member.read'),('elder','member.write'),
  ('elder','family.read'),('elder','family.write'),('elder','homecell.read'),
  ('elder','homecell.write'),('elder','ministry.read'),('elder','ministry.write'),
  ('elder','leadership.read'),('elder','visitor.read'),('elder','visitor.write'),
  ('elder','attendance.read'),('elder','attendance.write'),
  ('elder','shepherding.read'),('elder','shepherding.write'),
  ('elder','evangelism.read'),('elder','evangelism.write'),('elder','event.read'),
  ('elder','event.write'),('elder','prayer.read'),('elder','prayer.write'),
  ('elder','communication.read'),('elder','communication.write'),
  ('elder','document.read'),('elder','report.read'),('elder','report.export'),

  -- Deacon & Deaconess (welfare-capable)
  ('deacon','dashboard.view'),('deacon','member.read'),('deacon','member.write'),
  ('deacon','family.read'),('deacon','homecell.read'),('deacon','visitor.read'),
  ('deacon','visitor.write'),('deacon','attendance.read'),('deacon','attendance.write'),
  ('deacon','shepherding.read'),('deacon','shepherding.write'),
  ('deacon','welfare.read'),('deacon','welfare.write'),('deacon','prayer.read'),
  ('deacon','prayer.write'),('deacon','event.read'),('deacon','document.read'),
  ('deacon','report.read'),
  ('deaconess','dashboard.view'),('deaconess','member.read'),('deaconess','member.write'),
  ('deaconess','family.read'),('deaconess','homecell.read'),('deaconess','visitor.read'),
  ('deaconess','visitor.write'),('deaconess','attendance.read'),('deaconess','attendance.write'),
  ('deaconess','shepherding.read'),('deaconess','shepherding.write'),
  ('deaconess','welfare.read'),('deaconess','welfare.write'),('deaconess','prayer.read'),
  ('deaconess','prayer.write'),('deaconess','event.read'),('deaconess','document.read'),
  ('deaconess','report.read'),

  -- Secretary
  ('secretary','dashboard.view'),('secretary','member.read'),('secretary','member.write'),
  ('secretary','member.export'),('secretary','family.read'),('secretary','family.write'),
  ('secretary','homecell.read'),('secretary','ministry.read'),('secretary','visitor.read'),
  ('secretary','visitor.write'),('secretary','attendance.read'),('secretary','attendance.write'),
  ('secretary','event.read'),('secretary','event.write'),('secretary','prayer.read'),
  ('secretary','communication.read'),('secretary','communication.write'),
  ('secretary','document.read'),('secretary','document.write'),('secretary','asset.read'),
  ('secretary','asset.write'),('secretary','report.read'),('secretary','report.export'),
  ('secretary','settings.read'),

  -- Financial Secretary
  ('financial_secretary','dashboard.view'),('financial_secretary','member.read'),
  ('financial_secretary','finance.read'),('financial_secretary','finance.write'),
  ('financial_secretary','finance.export'),('financial_secretary','report.read'),
  ('financial_secretary','report.export'),('financial_secretary','document.read'),

  -- Ministry Leader
  ('ministry_leader','dashboard.view'),('ministry_leader','member.read'),
  ('ministry_leader','ministry.read'),('ministry_leader','ministry.write'),
  ('ministry_leader','event.read'),('ministry_leader','event.write'),
  ('ministry_leader','attendance.read'),('ministry_leader','attendance.write'),
  ('ministry_leader','communication.read'),('ministry_leader','communication.write'),
  ('ministry_leader','prayer.read'),('ministry_leader','report.read'),

  -- Home Cell Leader
  ('home_cell_leader','dashboard.view'),('home_cell_leader','member.read'),
  ('home_cell_leader','homecell.read'),('home_cell_leader','homecell.write'),
  ('home_cell_leader','attendance.read'),('home_cell_leader','attendance.write'),
  ('home_cell_leader','shepherding.read'),('home_cell_leader','shepherding.write'),
  ('home_cell_leader','visitor.read'),('home_cell_leader','visitor.write'),
  ('home_cell_leader','prayer.read'),('home_cell_leader','prayer.write'),
  ('home_cell_leader','event.read'),('home_cell_leader','report.read'),

  -- Media Team
  ('media_team','dashboard.view'),('media_team','member.read'),
  ('media_team','document.read'),('media_team','document.write'),
  ('media_team','communication.read'),('media_team','communication.write'),
  ('media_team','event.read'),('media_team','asset.read'),

  -- Church Worker
  ('church_worker','dashboard.view'),('church_worker','member.read'),
  ('church_worker','attendance.write'),('church_worker','event.read'),
  ('church_worker','prayer.read'),

  -- Member (self-service; broad reads intentionally absent — see 91_member_self_scope)
  ('member','dashboard.view'),('member','event.read'),('member','prayer.read'),
  ('member','prayer.write'),('member','document.read'),

  -- Auditor (read everything, write nothing)
  ('auditor','dashboard.view'),('auditor','member.read'),('auditor','family.read'),
  ('auditor','homecell.read'),('auditor','ministry.read'),('auditor','leadership.read'),
  ('auditor','visitor.read'),('auditor','attendance.read'),('auditor','shepherding.read'),
  ('auditor','counselling.read'),('auditor','welfare.read'),('auditor','evangelism.read'),
  ('auditor','event.read'),('auditor','prayer.read'),('auditor','finance.read'),
  ('auditor','finance.export'),('auditor','communication.read'),('auditor','document.read'),
  ('auditor','asset.read'),('auditor','report.read'),('auditor','report.export'),
  ('auditor','settings.read'),('auditor','audit.read')
)
insert into role_permission (role_id, permission_id, assembly_id, is_granted)
select r.id, p.id, null, true
from grants g
join role r on r.key = g.role_key
join permission p on p.key = g.perm_key
on conflict do nothing;
