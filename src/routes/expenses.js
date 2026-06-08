const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/auth");
const requireRole = require("../middleware/role");

const router = express.Router();

// ─────────────────────────────────────────────
// POST /expenses  – create expense (with transaction + rollback)
// ─────────────────────────────────────────────
router.post("/", authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { category_id, title, amount, date } = req.body;

    await connection.beginTransaction();

    // Verify the category exists before inserting
    const [categories] = await connection.query(
      "SELECT id FROM categories WHERE id = ?",
      [category_id]
    );

    if (categories.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: "Invalid category_id" });
    }

    await connection.query(
      `INSERT INTO expenses (user_id, category_id, title, amount, date)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, category_id, title, amount, date]
    );

    await connection.commit();

    res.status(201).json({ message: "Expense created" });

  } catch (error) {
    await connection.rollback();
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  } finally {
    connection.release();
  }
});

// ─────────────────────────────────────────────
// GET /expenses  – list expenses for logged-in user
// Optional: ?group_by=category | month | day
// ─────────────────────────────────────────────
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { group_by } = req.query;
    let expenses;

    if (group_by === "category") {
      [expenses] = await pool.query(
        `SELECT
           c.id             AS category_id,
           c.name           AS category_name,
           COUNT(e.id)      AS total_entries,
           SUM(e.amount)    AS total_amount
         FROM expenses e
         JOIN categories c ON e.category_id = c.id
         WHERE e.user_id = ? AND e.deleted_at IS NULL
         GROUP BY c.id, c.name
         ORDER BY total_amount DESC`,
        [req.user.id]
      );
    } else if (group_by === "month") {
      [expenses] = await pool.query(
        `SELECT
           DATE_FORMAT(e.date, '%Y-%m') AS month,
           COUNT(e.id)                  AS total_entries,
           SUM(e.amount)                AS total_amount
         FROM expenses e
         WHERE e.user_id = ? AND e.deleted_at IS NULL
         GROUP BY month
         ORDER BY month DESC`,
        [req.user.id]
      );
    } else if (group_by === "day") {
      [expenses] = await pool.query(
        `SELECT
           DATE(e.date)  AS day,
           COUNT(e.id)   AS total_entries,
           SUM(e.amount) AS total_amount
         FROM expenses e
         WHERE e.user_id = ? AND e.deleted_at IS NULL
         GROUP BY day
         ORDER BY day DESC`,
        [req.user.id]
      );
    } else {
      // Default flat list (your original query)
      [expenses] = await pool.query(
        "SELECT * FROM expenses WHERE user_id = ? AND deleted_at IS NULL",
        [req.user.id]
      );
    }

    res.json(expenses);

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
});

// ─────────────────────────────────────────────
// DELETE /expenses/:id  – soft delete (SAME USER ONLY, with transaction + rollback)
// ─────────────────────────────────────────────
router.delete("/:id", authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Ownership check: fetch expense and verify user_id
    const [expenses] = await connection.query(
      "SELECT id, user_id FROM expenses WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );

    if (expenses.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Expense not found" });
    }

    if (expenses[0].user_id !== req.user.id) {
      await connection.rollback();
      return res.status(403).json({
        message: "Forbidden – you can only delete your own expenses"
      });
    }

    await connection.query(
      "UPDATE expenses SET deleted_at = NOW() WHERE id = ?",
      [req.params.id]
    );

    await connection.commit();

    res.json({ message: "Expense deleted" });

  } catch (error) {
    await connection.rollback();
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  } finally {
    connection.release();
  }
});

// ─────────────────────────────────────────────
// POST /expenses/:id/submit  – member submits expense
// ─────────────────────────────────────────────
router.post(
  "/:id/submit",
  authenticateToken,
  requireRole("member"),
  async (req, res) => {
    try {
      await pool.query(
        "UPDATE expenses SET status='submitted' WHERE id=?",
        [req.params.id]
      );

      res.json({ message: "Expense submitted" });

    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Server Error" });
    }
  }
);

// ─────────────────────────────────────────────
// POST /expenses/:id/approve  – manager/admin approves (with transaction + rollback)
// ─────────────────────────────────────────────
router.post(
  "/:id/approve",
  authenticateToken,
  requireRole("manager", "admin"),
  async (req, res) => {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [expense] = await connection.query(
        "SELECT status FROM expenses WHERE id=?",
        [req.params.id]
      );

      if (expense.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Expense not found" });
      }

      if (expense[0].status !== "submitted") {
        await connection.rollback();
        return res.status(409).json({ message: "Invalid state transition" });
      }

      await connection.query(
        "UPDATE expenses SET status='approved' WHERE id=?",
        [req.params.id]
      );

      await connection.query(
        `INSERT INTO expense_approvals (expense_id, reviewed_by, status)
         VALUES (?, ?, ?)`,
        [req.params.id, req.user.id, "approved"]
      );

      await connection.commit();

      res.json({ message: "Expense approved" });

    } catch (error) {
      await connection.rollback();
      console.log(error);
      res.status(500).json({ message: "Server Error" });
    } finally {
      connection.release();
    }
  }
);

// ─────────────────────────────────────────────
// POST /expenses/:id/reject  – manager/admin rejects (with transaction + rollback)
// ─────────────────────────────────────────────
router.post(
  "/:id/reject",
  authenticateToken,
  requireRole("manager", "admin"),
  async (req, res) => {
    const connection = await pool.getConnection();

    try {
      const { comment } = req.body;

      await connection.beginTransaction();

      const [expense] = await connection.query(
        "SELECT status FROM expenses WHERE id=?",
        [req.params.id]
      );

      if (expense.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Expense not found" });
      }

      if (expense[0].status !== "submitted") {
        await connection.rollback();
        return res.status(409).json({ message: "Invalid state transition" });
      }

      await connection.query(
        "UPDATE expenses SET status='rejected' WHERE id=?",
        [req.params.id]
      );

      await connection.query(
        `INSERT INTO expense_approvals (expense_id, reviewed_by, status, comment)
         VALUES (?, ?, ?, ?)`,
        [req.params.id, req.user.id, "rejected", comment]
      );

      await connection.commit();

      res.json({ message: "Expense rejected" });

    } catch (error) {
      await connection.rollback();
      console.log(error);
      res.status(500).json({ message: "Server Error" });
    } finally {
      connection.release();
    }
  }
);

// ─────────────────────────────────────────────
// PATCH /expenses/:id  – update expense (owner + draft only, with transaction + rollback)
// ─────────────────────────────────────────────
router.patch("/:id", authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { title, amount, date, category_id } = req.body;

    await connection.beginTransaction();

    const [expenses] = await connection.query(
      "SELECT * FROM expenses WHERE id=?",
      [req.params.id]
    );

    if (expenses.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Expense not found" });
    }

    const expense = expenses[0];

    if (expense.user_id !== req.user.id || expense.status !== "draft") {
      await connection.rollback();
      return res.status(403).json({ message: "Cannot edit expense" });
    }

    await connection.query(
      `UPDATE expenses
       SET title=?, amount=?, date=?, category_id=?
       WHERE id=?`,
      [title, amount, date, category_id, req.params.id]
    );

    await connection.commit();

    res.json({ message: "Expense updated" });

  } catch (error) {
    await connection.rollback();
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  } finally {
    connection.release();
  }
});

module.exports = router;