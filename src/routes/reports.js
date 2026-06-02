const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

router.get("/monthly", authenticateToken, async (req, res) => {
  try {
    const [report] = await pool.query(`
      SELECT
      c.name AS category,
      COUNT(*) AS count,
      SUM(e.amount) AS total_amount,
      AVG(e.amount) AS average_amount
      FROM expenses e
      JOIN categories c
      ON e.category_id = c.id
      WHERE e.status = 'approved'
      GROUP BY c.name
    `);

    res.json(report);

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server Error"
    });
  }
});

module.exports = router;