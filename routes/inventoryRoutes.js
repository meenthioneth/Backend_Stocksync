const express = require('express');
const router = express.Router();
const { getNetworkOverview } = require('../controllers/inventoryController');

// จับคู่ URL: GET /api/inventory/network-overview
router.get('/network-overview', getNetworkOverview);

module.exports = router;