const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

router.get("/monthly", authenticateToken, async (req, res) => {
  try {
    const [report] = await pool.query(
      `SELECT
        c.id            AS category_id,
        c.name          AS category_name,
        COUNT(*)        AS count,
        SUM(e.amount)   AS total_amount,
        AVG(e.amount)   AS average_amount
       FROM expenses e
       JOIN categories c ON e.category_id = c.id
       WHERE e.status = 'approved'
         AND e.user_id = ?
       GROUP BY c.id, c.name
       ORDER BY total_amount DESC`,
      [req.user.id]
    );

    res.json(report);

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server Error"
    });
  }
});

module.exports = router;