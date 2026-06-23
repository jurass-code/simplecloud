const crypto = require('crypto');

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const ITERATIONS = 100000;
const DIGEST = 'sha512';
const SEPARATOR = ':';

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString('hex');
  return `${salt}${SEPARATOR}${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(SEPARATOR);
  if (!salt || !hash) {
    return false;
  }
  const computed = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  const storedBuf = Buffer.from(hash, 'hex');
  return crypto.timingSafeEqual(computed, storedBuf);
}

module.exports = { hashPassword, verifyPassword };
