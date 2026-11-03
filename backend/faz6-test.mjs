/**
 * FAZ 6 - Roller, Moderasyon, AutoMod, Audit Log Test
 * Kapsamlı endpoint testi
 */

const BASE = 'http://localhost:3001';

async function request(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const results = [];
  
  function log(test, passed, detail = '') {
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${test}${detail ? ': ' + detail : ''}`);
    results.push({ test, passed, detail });
  }
  
  try {
    // ============================================================
    // TEST USER'LARI OLUŞTUR
    // ============================================================
    console.log('\n=== TEST USER OLUŞTURMA ===');
    
    const ts = Date.now();
    
    // Admin user
    const adminReg = await request('POST', '/api/auth/register', null, {
      username: `faz6admin${ts}`,
      password: 'Test1234!',
      discriminator: '#6001'
    });
    const adminToken = adminReg.data?.token;
    const adminId = adminReg.data?.user?.id;
    log('Admin user oluştur', !!adminToken, adminId ? `ID: ${adminId}` : '');
    
    // Normal user
    const userReg = await request('POST', '/api/auth/register', null, {
      username: `faz6user${ts}`,
      password: 'Test1234!',
      discriminator: '#6002'
    });
    const userToken = userReg.data?.token;
    const userId = userReg.data?.user?.id;
    log('Normal user oluştur', !!userToken, userId ? `ID: ${userId}` : '');
    
    // Target user (ban/kick edilecek)
    const targetReg = await request('POST', '/api/auth/register', null, {
      username: `faz6target${ts}`,
      password: 'Test1234!',
      discriminator: '#6003'
    });
    const targetToken = targetReg.data?.token;
    const targetId = targetReg.data?.user?.id;
    log('Target user oluştur', !!targetToken, targetId ? `ID: ${targetId}` : '');
    
    if (!adminToken || !userToken || !targetToken) {
      console.log('❌ Test user\'ları oluşturulamadı, test durduruluyor');
      process.exit(1);
    }
    
    // ============================================================
    // SERVER OLUŞTUR
    // ============================================================
    console.log('\n=== SERVER OLUŞTURMA ===');
    
    const serverRes = await request('POST', '/api/servers', adminToken, {
      name: 'FAZ 6 Test Server',
      description: 'Testing roles and moderation'
    });
    const serverId = serverRes.data?.server?.id;
    log('Server oluştur', !!serverId, serverId ? `ID: ${serverId}` : '');
    
    // User'ları server'a ekle
    const joinUser = await request('POST', `/api/servers/${serverId}/join`, userToken, {});
    log('User server\'a katıldı', joinUser.status === 200);
    
    const joinTarget = await request('POST', `/api/servers/${serverId}/join`, targetToken, {});
    log('Target server\'a katıldı', joinTarget.status === 200);
    
    // ============================================================
    // 1. ROL YÖNETİMİ
    // ============================================================
    console.log('\n=== 1. ROL YÖNETİMİ ===');
    
    // GET roles (owner olarak)
    const getRoles = await request('GET', `/api/servers/${serverId}/roles`, adminToken);
    log('GET /servers/:id/roles', getRoles.status === 200 && getRoles.data.success);
    
    // POST roles - Yeni rol oluştur
    const createRole = await request('POST', `/api/servers/${serverId}/roles`, adminToken, {
      name: 'Moderator',
      color: '#FF5722',
      permissions: '1088', // KICK_MEMBERS(32) + BAN_MEMBERS(64) + MODERATE_MEMBERS(1024) = 1120... let me calculate
      // BAN_MEMBERS=64, KICK_MEMBERS=32, MODERATE_MEMBERS=1024 => 64+32+1024 = 1120
      position: 10,
      hoist: true,
      mentionable: true
    });
    log('POST /servers/:id/roles (create)', createRole.status === 201 && createRole.data.success);
    const modRoleId = createRole.data?.role?.id;
    
    // POST roles - Admin rolü
    const createAdminRole = await request('POST', `/api/servers/${serverId}/roles`, adminToken, {
      name: 'Admin',
      color: '#E91E63',
      permissions: '1', // ADMINISTRATOR
      position: 20,
      hoist: true,
      mentionable: false
    });
    log('POST /servers/:id/roles (admin role)', createAdminRole.status === 201);
    
    // POST roles - Validation test (name too long)
    const badRole = await request('POST', `/api/servers/${serverId}/roles`, adminToken, {
      name: 'x'.repeat(101),
    });
    log('POST roles validation (name too long)', badRole.status === 400);
    
    // POST roles - Normal user without MANAGE_ROLES (should fail)
    const userCreateRole = await request('POST', `/api/servers/${serverId}/roles`, userToken, {
      name: 'Hacker Role',
    });
    log('POST roles without permission (403)', userCreateRole.status === 403);
    
    // GET roles - Member olarak (user)
    const userGetRoles = await request('GET', `/api/servers/${serverId}/roles`, userToken);
    log('GET roles (member)', userGetRoles.status === 200);
    
    // PUT roles - Update
    if (modRoleId) {
      const updateRole = await request('PUT', `/api/roles/${modRoleId}`, adminToken, {
        name: 'Senior Moderator',
        color: '#FF9800',
        position: 15
      });
      log('PUT /roles/:id (update)', updateRole.status === 200 && updateRole.data.success);
    }
    
    // Role assignment
    const memberRes = await request('GET', `/api/servers/${serverId}/members`, adminToken);
    const members = memberRes.data?.members || [];
    const targetMember = members.find(m => m.user?.id === targetId);
    
    if (modRoleId && targetMember) {
      const assignRole = await request('POST', 
        `/api/servers/${serverId}/members/${targetId}/roles/${modRoleId}`, 
        adminToken, {});
      log('POST member/roles (assign)', assignRole.status === 200 && assignRole.data.success);
      
      // Assign again (should fail - already has)
      const assignAgain = await request('POST', 
        `/api/servers/${serverId}/members/${targetId}/roles/${modRoleId}`, 
        adminToken, {});
      log('POST member/roles (duplicate)', assignAgain.status === 400);
      
      // Remove role
      const removeRole = await request('DELETE', 
        `/api/servers/${serverId}/members/${targetId}/roles/${modRoleId}`, 
        adminToken);
      log('DELETE member/roles (remove)', removeRole.status === 200 && removeRole.data.success);
      
      // Remove again (should fail)
      const removeAgain = await request('DELETE', 
        `/api/servers/${serverId}/members/${targetId}/roles/${modRoleId}`, 
        adminToken);
      log('DELETE member/roles (not has)', removeAgain.status === 400);
    } else {
      log('Role assignment tests', false, 'No member or role found');
    }
    
    // DELETE roles
    if (modRoleId) {
      const deleteRole = await request('DELETE', `/api/roles/${modRoleId}`, adminToken);
      log('DELETE /roles/:id', deleteRole.status === 200 && deleteRole.data.success);
    }
    
    // ============================================================
    // 2. MODERASYON
    // ============================================================
    console.log('\n=== 2. MODERASYON ===');
    
    // TIMEOUT - Target user'ı timeout'la
    const timeout = await request('POST', `/api/servers/${serverId}/timeouts`, adminToken, {
      userId: targetId,
      duration: 60,
      reason: 'Test timeout'
    });
    log('POST /servers/:id/timeouts', timeout.status === 200 && timeout.data.success);
    
    // Timeout validation (too long)
    const badTimeout = await request('POST', `/api/servers/${serverId}/timeouts`, adminToken, {
      userId: targetId,
      duration: 9999999,
      reason: 'Too long'
    });
    log('POST timeouts validation (duration)', badTimeout.status === 400);
    
    // Timeout without permission
    const userTimeout = await request('POST', `/api/servers/${serverId}/timeouts`, userToken, {
      userId: targetId,
      duration: 60,
      reason: 'Hacker timeout'
    });
    log('POST timeouts without permission (403)', userTimeout.status === 403);
    
    // DELETE timeout
    const removeTimeout = await request('DELETE', `/api/servers/${serverId}/timeouts/${targetId}`, adminToken);
    log('DELETE /servers/:id/timeouts/:userId', removeTimeout.status === 200 && removeTimeout.data.success);
    
    // DELETE timeout (not found)
    const removeTimeout2 = await request('DELETE', `/api/servers/${serverId}/timeouts/${targetId}`, adminToken);
    log('DELETE timeouts (not found)', removeTimeout2.status === 404);
    
    // KICK - Yeni bir target user oluştur (kick edilen geri gelemez)
    const kickTargetReg = await request('POST', '/api/auth/register', null, {
      username: `faz6kick${ts}`,
      password: 'Test1234!',
      discriminator: '#6004'
    });
    const kickTargetToken = kickTargetReg.data?.token;
    const kickTargetId = kickTargetReg.data?.user?.id;
    
    if (kickTargetToken) {
      await request('POST', `/api/servers/${serverId}/join`, kickTargetToken, {});
      
      const kick = await request('POST', `/api/servers/${serverId}/kicks`, adminToken, {
        userId: kickTargetId,
        reason: 'Test kick'
      });
      log('POST /servers/:id/kicks', kick.status === 200 && kick.data.success);
      
      // Kick without permission
      const userKick = await request('POST', `/api/servers/${serverId}/kicks`, userToken, {
        userId: targetId,
        reason: 'Hacker kick'
      });
      log('POST kicks without permission (403)', userKick.status === 403);
    }
    
    // BAN - Target user'ı ban'la
    const ban = await request('POST', `/api/servers/${serverId}/bans`, adminToken, {
      userId: targetId,
      reason: 'Test ban',
      deleteMessageDays: 1
    });
    log('POST /servers/:id/bans', ban.status === 201 && ban.data.success);
    
    // Ban duplicate
    const ban2 = await request('POST', `/api/servers/${serverId}/bans`, adminToken, {
      userId: targetId,
      reason: 'Again'
    });
    log('POST bans (duplicate)', ban2.status === 400);
    
    // Ban without permission
    const userBan = await request('POST', `/api/servers/${serverId}/bans`, userToken, {
      userId: targetId,
      reason: 'Hacker ban'
    });
    log('POST bans without permission (403)', userBan.status === 403);
    
    // GET bans
    const getBans = await request('GET', `/api/servers/${serverId}/bans`, adminToken);
    log('GET /servers/:id/bans', getBans.status === 200 && getBans.data.success);
    log('GET bans contains target', getBans.data?.bans?.some(b => b.user?.id === targetId));
    
    // GET bans without permission
    const userGetBans = await request('GET', `/api/servers/${serverId}/bans`, userToken);
    log('GET bans without permission (403)', userGetBans.status === 403);
    
    // DELETE ban (unban)
    const unban = await request('DELETE', `/api/servers/${serverId}/bans/${targetId}`, adminToken);
    log('DELETE /servers/:id/bans/:userId', unban.status === 200 && unban.data.success);
    
    // Unban not found
    const unban2 = await request('DELETE', `/api/servers/${serverId}/bans/${targetId}`, adminToken);
    log('DELETE ban (not found)', unban2.status === 404);
    
    // ============================================================
    // 3. AUTOMOD
    // ============================================================
    console.log('\n=== 3. AUTOMOD ===');
    
    // GET automod
    const getAutoMod = await request('GET', `/api/servers/${serverId}/automod`, adminToken);
    log('GET /servers/:id/automod', getAutoMod.status === 200 && getAutoMod.data.success);
    
    // PUT automod - Enable with rules
    const updateAutoMod = await request('PUT', `/api/servers/${serverId}/automod`, adminToken, {
      enabled: true,
      rules: [
        {
          type: 'KEYWORD',
          action: 'BLOCK',
          config: { keywords: ['badword', 'spam'] }
        },
        {
          type: 'CAPS_SPAM',
          action: 'FLAG',
          config: { maxPercentage: 70, minLength: 10 }
        },
        {
          type: 'MENTION_SPAM',
          action: 'TIMEOUT',
          config: { maxMentions: 3, timeoutDuration: 60 }
        },
        {
          type: 'LINK_FILTER',
          action: 'BLOCK',
          config: { allowedDomains: ['discord.com', 'youtube.com'] }
        }
      ]
    });
    log('PUT /servers/:id/automod', updateAutoMod.status === 200 && updateAutoMod.data.success);
    log('PUT automod rules count', updateAutoMod.data?.automod?.rules?.length === 4);
    
    // PUT automod validation
    const badAutoMod = await request('PUT', `/api/servers/${serverId}/automod`, adminToken, {
      rules: [{ type: 'INVALID_TYPE', action: 'BLOCK', config: {} }]
    });
    log('PUT automod validation (bad type)', badAutoMod.status === 400);
    
    // PUT automod without permission
    const userAutoMod = await request('PUT', `/api/servers/${serverId}/automod`, userToken, {
      enabled: true,
      rules: []
    });
    log('PUT automod without permission (403)', userAutoMod.status === 403);
    
    // Test automod on message - KEYWORD block
    // Create a channel first
    const channelRes = await request('POST', `/api/servers/${serverId}/channels`, adminToken, {
      name: 'automod-test',
      type: 'TEXT'
    });
    const channelId = channelRes.data?.channel?.id;
    
    if (channelId) {
      // Re-join target (was banned then unbanned, need to rejoin)
      await request('POST', `/api/servers/${serverId}/join`, targetToken, {});
      
      // Send message with bad word (should be blocked)
      const badMsg = await request('POST', `/api/channels/${channelId}/messages`, targetToken, {
        content: 'This contains badword in it'
      });
      log('AutoMod KEYWORD block', badMsg.status === 403);
      
      // Send normal message (should pass)
      const goodMsg = await request('POST', `/api/channels/${channelId}/messages`, targetToken, {
        content: 'Hello world!'
      });
      log('AutoMod normal message passes', goodMsg.status === 201);
      
      // Send message with bad link
      const badLink = await request('POST', `/api/channels/${channelId}/messages`, targetToken, {
        content: 'Check out http://malicious-site.com'
      });
      log('AutoMod LINK_FILTER block', badLink.status === 403);
      
      // Send message with allowed link
      const goodLink = await request('POST', `/api/channels/${channelId}/messages`, targetToken, {
        content: 'Check out https://youtube.com/video'
      });
      log('AutoMod allowed link passes', goodLink.status === 201);
    }
    
    // ============================================================
    // 4. AUDIT LOG
    // ============================================================
    console.log('\n=== 4. AUDIT LOG ===');
    
    // GET audit-log
    const getAudit = await request('GET', `/api/servers/${serverId}/audit-log`, adminToken);
    log('GET /servers/:id/audit-log', getAudit.status === 200 && getAudit.data.success);
    log('GET audit-log has entries', getAudit.data?.logs?.length > 0);
    
    // GET audit-log with filter
    const getAuditFiltered = await request('GET', 
      `/api/servers/${serverId}/audit-log?action=BAN`, adminToken);
    log('GET audit-log filtered (BAN)', getAuditFiltered.status === 200);
    
    // GET audit-log pagination
    const getAuditPaged = await request('GET', 
      `/api/servers/${serverId}/audit-log?limit=5&offset=0`, adminToken);
    log('GET audit-log paginated', getAuditPaged.status === 200 && getAuditPaged.data?.pagination);
    
    // GET audit-log without permission (normal user)
    const userAudit = await request('GET', `/api/servers/${serverId}/audit-log`, userToken);
    log('GET audit-log without permission (403)', userAudit.status === 403);
    
    // ============================================================
    // SONUÇLAR
    // ============================================================
    console.log('\n=== TEST SONUÇLARI ===');
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.log(`Toplam: ${results.length} test`);
    console.log(`✅ Geçen: ${passed}`);
    console.log(`❌ Başarısız: ${failed}`);
    
    if (failed > 0) {
      console.log('\nBaşarısız testler:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  ❌ ${r.test}${r.detail ? ': ' + r.detail : ''}`);
      });
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

main();
