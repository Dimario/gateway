const express = require('express');
const path = require('path');
const fs = require('fs');
const { UPLOAD_DIR } = require('../config');

const router = express.Router();

// GET /files/:filename - download uploaded file
router.get('/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.resolve(UPLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(filePath);
});

module.exports = router;
