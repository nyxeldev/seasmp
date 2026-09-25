-- ═══════════════════════════════════════════════════════════════════════════
-- SEASMP — 1-qatlam (avtorizatsiya) namoyishi
--
-- Ishlatish:  psql -U postgres -d seasmp_db -f scripts/detection-demo.sql
--
-- Bu skript sinov ma'lumotini yaratadi, so'rovlar oqimini simulyatsiya qiladi
-- va aniqlash natijalarini chiqaradi. Migratsiya qo'llangandan keyin ishlaydi.
-- DIQQAT: mavjud ma'lumotni o'chiradi — faqat dev bazada ishlating.
-- ═══════════════════════════════════════════════════════════════════════════

TRUNCATE audit_logs, security_alerts, grades, assessments, attendance,
         enrollments, courses, users RESTART IDENTITY CASCADE;

-- ─── Sinov ma'lumoti ────────────────────────────────────────────────────────
INSERT INTO users (id,email,password_hash,first_name,last_name,role,updated_at) VALUES
 ('11111111-1111-1111-1111-111111111111','t1@edu.uz','x','Tolib','Aliyev','TEACHER',now()),
 ('22222222-2222-2222-2222-222222222222','t2@edu.uz','x','Tursun','Bekov','TEACHER',now()),
 ('33333333-3333-3333-3333-333333333333','s1@edu.uz','x','Sardor','Karimov','STUDENT',now()),
 ('44444444-4444-4444-4444-444444444444','s2@edu.uz','x','Sevara','Normatova','STUDENT',now()),
 ('55555555-5555-5555-5555-555555555555','a1@edu.uz','x','Admin','Adminov','ADMIN',now());

INSERT INTO courses (id,title,teacher_id,category,duration_weeks,updated_at) VALUES
 ('c1111111-1111-1111-1111-111111111111','Python asoslari','11111111-1111-1111-1111-111111111111','IT',12,now()),
 ('c2222222-2222-2222-2222-222222222222','Tarmoq xavfsizligi','22222222-2222-2222-2222-222222222222','IT',10,now());

INSERT INTO enrollments (id,student_id,course_id) VALUES
 ('e1111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','c1111111-1111-1111-1111-111111111111'),
 ('e2222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444','c1111111-1111-1111-1111-111111111111');

-- ─── Egalik hal qiluvchisi (ownershipResolver.ts ning SQL ko'rinishi) ───────
CREATE OR REPLACE FUNCTION resolve_access(p_res text, p_rid uuid, p_actor uuid, p_role text)
RETURNS TABLE(relation text, owner_id uuid) AS $$
DECLARE v_owner uuid; v_cust uuid;
BEGIN
  IF p_role IN ('ADMIN','SUPER_ADMIN') THEN RETURN QUERY SELECT 'PRIVILEGED', NULL::uuid; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM ownership_rules WHERE resource_type=p_res AND active) THEN
    RETURN QUERY SELECT 'UNKNOWN', NULL::uuid; RETURN; END IF;
  IF p_rid IS NULL THEN RETURN QUERY SELECT 'UNKNOWN', NULL::uuid; RETURN; END IF;

  IF p_res='users' THEN
    IF p_rid=p_actor THEN RETURN QUERY SELECT 'SELF', p_actor;
    ELSE RETURN QUERY SELECT 'FOREIGN', p_rid; END IF; RETURN;
  ELSIF p_res='courses' THEN
    SELECT teacher_id INTO v_cust FROM courses WHERE id=p_rid;
  ELSIF p_res='enrollments' THEN
    SELECT e.student_id, c.teacher_id INTO v_owner, v_cust
      FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.id=p_rid;
  ELSIF p_res='assessments' THEN
    SELECT c.teacher_id INTO v_cust FROM assessments a JOIN courses c ON c.id=a.course_id WHERE a.id=p_rid;
  END IF;

  IF v_owner IS NULL AND v_cust IS NULL THEN RETURN QUERY SELECT 'UNKNOWN', NULL::uuid; RETURN; END IF;
  IF p_actor=v_owner THEN RETURN QUERY SELECT 'OWNER', v_owner; RETURN; END IF;
  IF p_actor=v_cust  THEN RETURN QUERY SELECT 'CUSTODIAN', v_owner; RETURN; END IF;
  RETURN QUERY SELECT 'FOREIGN', v_owner;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sim(p_actor uuid, p_role text, p_method text, p_path text,
                               p_res text, p_rid uuid, p_status int) RETURNS void AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM resolve_access(p_res,p_rid,p_actor,p_role);
  INSERT INTO audit_logs(user_id,action,resource,resource_id,resource_owner_id,access_relation,
                         ip_address,http_method,path,status_code,duration_ms)
  VALUES (p_actor, CASE WHEN p_status IN (401,403) THEN 'ACCESS_DENIED' ELSE 'ACCESS' END::"AuditAction",
          p_res,p_rid,r.owner_id,r.relation::"AccessRelation",'10.0.0.7',p_method,p_path,p_status,
          8+floor(random()*20)::int);
END $$ LANGUAGE plpgsql;

-- ─── So'rovlar oqimi ────────────────────────────────────────────────────────
SELECT sim('33333333-3333-3333-3333-333333333333','STUDENT','GET','/v1/enrollments/e1111111-1111-1111-1111-111111111111','enrollments','e1111111-1111-1111-1111-111111111111',200);
SELECT sim('33333333-3333-3333-3333-333333333333','STUDENT','GET','/v1/enrollments/e2222222-2222-2222-2222-222222222222','enrollments','e2222222-2222-2222-2222-222222222222',403) FROM generate_series(1,5);
SELECT sim('11111111-1111-1111-1111-111111111111','TEACHER','GET','/v1/courses/c1111111-1111-1111-1111-111111111111','courses','c1111111-1111-1111-1111-111111111111',200);
SELECT sim('22222222-2222-2222-2222-222222222222','TEACHER','GET','/v1/courses/c1111111-1111-1111-1111-111111111111','courses','c1111111-1111-1111-1111-111111111111',403);
SELECT sim('55555555-5555-5555-5555-555555555555','ADMIN','GET','/v1/courses/c1111111-1111-1111-1111-111111111111','courses','c1111111-1111-1111-1111-111111111111',200);
-- Eng muhimi: so'rov o'tib ketdi, lekin obyekt begona
SELECT sim('33333333-3333-3333-3333-333333333333','STUDENT','GET','/v1/enrollments/e2222222-2222-2222-2222-222222222222','enrollments','e2222222-2222-2222-2222-222222222222',200);
-- Qoida yozilmagan resurs
SELECT sim('33333333-3333-3333-3333-333333333333','STUDENT','GET','/v1/analytics/summary','analytics',NULL,200);

-- ─── Aniqlash qoidalari ─────────────────────────────────────────────────────
INSERT INTO security_alerts(type,severity,layer,score,detector_version,user_id,ip_address,details)
SELECT 'UNAUTHORIZED_OBJECT_ACCESS','HIGH','AUTHORIZATION',1.0,'authz-1.0.0',user_id,max(ip_address),
       jsonb_build_object('reason','REPEATED_DENIALS','attempts',count(*))
FROM audit_logs WHERE access_relation='FOREIGN' AND status_code=403
GROUP BY user_id HAVING count(*)>=5;

INSERT INTO security_alerts(type,severity,layer,score,detector_version,user_id,ip_address,details)
SELECT 'UNAUTHORIZED_OBJECT_ACCESS','CRITICAL','AUTHORIZATION',1.0,'authz-1.0.0',user_id,ip_address,
       jsonb_build_object('reason','FOREIGN_OBJECT_200','path',path)
FROM audit_logs WHERE access_relation='FOREIGN' AND status_code=200;

-- ─── Hisobotlar ─────────────────────────────────────────────────────────────
\echo ''
\echo '═══ AUDIT LOG ═══'
SELECT u.first_name AS kim, a.http_method||' '||left(a.path,42) AS sorov, a.status_code AS kod,
       a.access_relation AS munosabat, coalesce(o.first_name,'—') AS egasi
FROM audit_logs a JOIN users u ON u.id=a.user_id
LEFT JOIN users o ON o.id=a.resource_owner_id ORDER BY a.id;

\echo '═══ OGOHLANTIRISHLAR ═══'
SELECT a.severity AS daraja, a.layer AS qatlam, u.first_name AS kim, a.details->>'reason' AS sabab,
       coalesce(a.details->>'attempts', a.details->>'path') AS tafsilot
FROM security_alerts a JOIN users u ON u.id=a.user_id ORDER BY a.severity DESC;

\echo '═══ QAMROV AUDITI ═══'
SELECT resource AS resurs, count(*) AS sorovlar,
       CASE WHEN bool_and(access_relation='UNKNOWN') THEN 'QOIDA YO''Q' ELSE 'qoplangan' END AS holat
FROM audit_logs GROUP BY resource ORDER BY 3, 1;

\echo '═══ MUNOSABAT TAQSIMOTI ═══'
SELECT access_relation AS munosabat, count(*) AS soni,
       count(*) FILTER (WHERE status_code=200) AS ruxsat_berilgan,
       count(*) FILTER (WHERE status_code=403) AS rad_etilgan
FROM audit_logs GROUP BY access_relation ORDER BY 2 DESC;
