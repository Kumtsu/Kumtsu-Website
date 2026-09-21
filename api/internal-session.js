const { currentUser, send } = require('./_internal-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { message: 'Method not allowed' });
  const auth = await currentUser(req);
  return auth ? send(res, 200, { user: auth.user }) : send(res, 401, { message: 'กรุณาเข้าสู่ระบบ' });
};
