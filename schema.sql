CREATE TABLE users(
 id INT AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 email VARCHAR(100) UNIQUE NOT NULL,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('admin','manager','member') NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories(
 id INT AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expenses(
 id INT AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 category_id INT NOT NULL,
 title VARCHAR(255) NOT NULL,
 amount DECIMAL(10,2) NOT NULL,
 date DATE NOT NULL,
 status ENUM('draft','submitted','approved','rejected') DEFAULT 'draft',
 deleted_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id),
 FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE expense_approvals(
 id INT AUTO_INCREMENT PRIMARY KEY,
 expense_id INT NOT NULL,
 reviewed_by INT NOT NULL,
 status ENUM('approved','rejected') NOT NULL,
 comment TEXT,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (expense_id) REFERENCES expenses(id),
 FOREIGN KEY (reviewed_by) REFERENCES users(id)
);