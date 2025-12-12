const jwt = require('jsonwebtoken');

const adminApiKey = '6939f3e2ed26f2e262de6b8b:db561e9556176b8bd766bde57c6a7d64c6ea3b19a728c60c4d4e491a5dfefb83';
const [id, secret] = adminApiKey.split(':');
const memberEmail = 'me@annemariecharrett.com';
const ghostUrl = 'http://localhost:2368';

const token = jwt.sign({}, Buffer.from(secret, 'hex'), {
  keyid: id,
  algorithm: 'HS256',
  expiresIn: '5m',
  audience: '/admin/'
});

async function test() {
  console.log('1. Finding member:', memberEmail);

  const membersRes = await fetch(`${ghostUrl}/ghost/api/admin/members/?filter=email:'${memberEmail}'`, {
    headers: { 'Authorization': `Ghost ${token}` }
  });
  
  const membersData = await membersRes.json();
  
  if (!membersData.members || membersData.members.length === 0) {
    console.log('Member not found!');
    return;
  }
  
  const memberId = membersData.members[0].id;
  console.log('2. Found member ID:', memberId);
  
  console.log('3. Getting impersonation URL (GET, not POST)...');
  const impRes = await fetch(`${ghostUrl}/ghost/api/admin/members/${memberId}/signin_urls`, {
    method: 'GET',
    headers: { 
      'Authorization': `Ghost ${token}`
    }
  });
  
  console.log('   Status:', impRes.status);
  const impData = await impRes.json();
  
  if (impData.member_signin_urls) {
    console.log('4. SUCCESS! Impersonation URL:');
    console.log('   ', impData.member_signin_urls[0].url);
  } else {
    console.log('   Response:', JSON.stringify(impData, null, 2));
  }
}

test().catch(e => console.error('Error:', e));
