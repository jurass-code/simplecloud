// Multipart upload limits shared by the upload route, the error mapper and the
// client (exposed through GET /api/config) so all three agree on the numbers.
// The client chunks a multi-file selection into requests of at most
// MAX_FILES_PER_UPLOAD, so a limit hit is a sign of a direct API caller.
const MAX_FILES_PER_UPLOAD = 50;

module.exports = { MAX_FILES_PER_UPLOAD };
