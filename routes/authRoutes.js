const express = require('express');
const router = express.Router();
const { loginUser, logoutUser } = require('../controllers/authController');

// จับคู่ URL: POST /api/auth/login
router.post('/login', loginUser);
router.post('/logout', logoutUser);

module.exports = router;