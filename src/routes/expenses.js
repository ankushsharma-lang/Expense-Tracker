const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/auth");
const requireRole = require("../middleware/role");

const router = express.Router();

router.post("/", authenticateToken, async (req, res) => {
  try {
    const { category_id, title, amount, date } = req.body;

    await pool.query(
      `INSERT INTO expenses
      (user_id, category_id, title, amount, date)
      VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, category_id, title, amount, date]
    );

    res.status(201).json({
      message: "Expense created"
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server Error"
    });
  }
});

router.get("/", authenticateToken, async (req, res) => {
  try {
    const [expenses] = await pool.query(
      "SELECT * FROM expenses WHERE user_id = ? AND deleted_at IS NULL",
      [req.user.id]
    );

    res.json(expenses);
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server Error"
    });
  }
});
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query(
      "UPDATE expenses SET deleted_at = NOW() WHERE id = ?",
      [req.params.id]
    );

    res.json({
      message: "Expense deleted"
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server Error"
    });
  }
});
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

    res.json({
      message: "Expense submitted"
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server Error"
    });
  }
});
router.post("/:id/submit", authenticateToken, async (req, res) => {
  try {
    await pool.query(
      "UPDATE expenses SET status='submitted' WHERE id=?",
      [req.params.id]
    );

    res.json({
      message: "Expense submitted"
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server Error"
    });
  }
});
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

        return res.status(404).json({
          message: "Expense not found"
        });
      }

      if (expense[0].status !== "submitted") {
        await connection.rollback();

        return res.status(409).json({
          message: "Invalid state transition"
        });
      }

      await connection.query(
        "UPDATE expenses SET status='approved' WHERE id=?",
        [req.params.id]
      );

      await connection.query(
        `INSERT INTO expense_approvals
        (expense_id, reviewed_by, status)
        VALUES (?, ?, ?)`,
        [
          req.params.id,
          req.user.id,
          "approved"
        ]
      );

      await connection.commit();

      res.json({
        message: "Expense approved"
      });

    } catch (error) {

      await connection.rollback();

      console.log(error);

      res.status(500).json({
        message: "Server Error"
      });

    } finally {

      connection.release();

    }
  }
);
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

        return res.status(404).json({
          message: "Expense not found"
        });
      }

      if (expense[0].status !== "submitted") {

        await connection.rollback();

        return res.status(409).json({
          message: "Invalid state transition"
        });
      }

      await connection.query(
        "UPDATE expenses SET status='rejected' WHERE id=?",
        [req.params.id]
      );

      await connection.query(
        `INSERT INTO expense_approvals
        (expense_id, reviewed_by, status, comment)
        VALUES (?, ?, ?, ?)`,
        [
          req.params.id,
          req.user.id,
          "rejected",
          comment
        ]
      );

      await connection.commit();

      res.json({
        message: "Expense rejected"
      });

    } catch (error) {

      await connection.rollback();

      console.log(error);

      res.status(500).json({
        message: "Server Error"
      });

    } finally {

      connection.release();

    }
  }
);
router.patch("/:id", authenticateToken, async (req, res) => {
  try {
    const { title, amount, date, category_id } = req.body;

    const [expenses] = await pool.query(
      "SELECT * FROM expenses WHERE id=?",
      [req.params.id]
    );

    if (expenses.length === 0) {
      return res.status(404).json({
        message: "Expense not found"
      });
    }

    const expense = expenses[0];

    if (
      expense.user_id !== req.user.id ||
      expense.status !== "draft"
    ) {
      return res.status(403).json({
        message: "Cannot edit expense"
      });
    }

    await pool.query(
      `UPDATE expenses
       SET title=?, amount=?, date=?, category_id=?
       WHERE id=?`,
      [
        title,
        amount,
        date,
        category_id,
        req.params.id
      ]
    );

    res.json({
      message: "Expense updated"
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server Error"
    });
  }
});
module.exports = router;