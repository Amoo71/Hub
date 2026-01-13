const fs = require('fs');
const path = require('path');

// Storage abstraction layer - supports both JSON (local) and PostgreSQL (production)
class Storage {
  constructor() {
    this.useDatabase = process.env.DATABASE_URL ? true : false;
    this.db = null;
    this.credentials = [];
    
    if (this.useDatabase) {
      this.initDatabase();
    } else {
      this.initJSON();
    }
  }

  // PostgreSQL initialization
  async initDatabase() {
    try {
      const { Pool } = require('pg');
      this.db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      // Create table if not exists
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS credentials (
          id VARCHAR(255) PRIMARY KEY,
          cover TEXT NOT NULL,
          acc TEXT NOT NULL,
          pass TEXT NOT NULL,
          reported BOOLEAN DEFAULT FALSE,
          "order" INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Check if we have any data
      const result = await this.db.query('SELECT COUNT(*) FROM credentials');
      const count = parseInt(result.rows[0].count);

      // If empty, insert defaults
      if (count === 0) {
        await this.insertDefaults();
      }

      console.log('PostgreSQL database initialized');
    } catch (err) {
      console.error('Database initialization error:', err);
      // Fallback to JSON
      this.useDatabase = false;
      this.initJSON();
    }
  }

  async insertDefaults() {
    const defaults = [
      {
        id: '1',
        cover: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400',
        acc: 'demo@example.com',
        pass: 'DemoPassword123',
        reported: false,
        order: 0
      },
      {
        id: '2',
        cover: 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=400',
        acc: 'admin@vault.com',
        pass: 'SecurePass456',
        reported: false,
        order: 1
      }
    ];

    for (const cred of defaults) {
      await this.db.query(
        'INSERT INTO credentials (id, cover, acc, pass, reported, "order") VALUES ($1, $2, $3, $4, $5, $6)',
        [cred.id, cred.cover, cred.acc, cred.pass, cred.reported, cred.order]
      );
    }
    console.log('Default credentials inserted');
  }

  // JSON file initialization (for local development)
  initJSON() {
    this.dataFile = path.join(__dirname, 'credentials.json');
    
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile, 'utf8');
        this.credentials = JSON.parse(data);
        console.log('Credentials loaded from JSON file');
      } else {
        this.credentials = [
          {
            id: '1',
            cover: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400',
            acc: 'demo@example.com',
            pass: 'DemoPassword123',
            reported: false,
            order: 0
          },
          {
            id: '2',
            cover: 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=400',
            acc: 'admin@vault.com',
            pass: 'SecurePass456',
            reported: false,
            order: 1
          }
        ];
        this.saveJSON();
        console.log('Using default credentials (JSON)');
      }
    } catch (err) {
      console.error('Error loading JSON:', err);
      this.credentials = [];
    }
  }

  saveJSON() {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.credentials, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving JSON:', err);
    }
  }

  // Get all credentials
  async getAll() {
    if (this.useDatabase) {
      const result = await this.db.query('SELECT * FROM credentials ORDER BY "order" ASC');
      return result.rows;
    } else {
      return [...this.credentials].sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  }

  // Get single credential
  async getById(id) {
    if (this.useDatabase) {
      const result = await this.db.query('SELECT * FROM credentials WHERE id = $1', [id]);
      return result.rows[0] || null;
    } else {
      return this.credentials.find(c => c.id === id) || null;
    }
  }

  // Add credential
  async add(credential) {
    if (this.useDatabase) {
      await this.db.query(
        'INSERT INTO credentials (id, cover, acc, pass, reported, "order") VALUES ($1, $2, $3, $4, $5, $6)',
        [credential.id, credential.cover, credential.acc, credential.pass, credential.reported || false, credential.order || 0]
      );
    } else {
      this.credentials.push(credential);
      this.saveJSON();
    }
  }

  // Update credential
  async update(id, updates) {
    if (this.useDatabase) {
      const sets = [];
      const values = [];
      let paramIndex = 1;

      if (updates.cover !== undefined) {
        sets.push(`cover = $${paramIndex++}`);
        values.push(updates.cover);
      }
      if (updates.acc !== undefined) {
        sets.push(`acc = $${paramIndex++}`);
        values.push(updates.acc);
      }
      if (updates.pass !== undefined) {
        sets.push(`pass = $${paramIndex++}`);
        values.push(updates.pass);
      }
      if (updates.reported !== undefined) {
        sets.push(`reported = $${paramIndex++}`);
        values.push(updates.reported);
      }
      if (updates.order !== undefined) {
        sets.push(`"order" = $${paramIndex++}`);
        values.push(updates.order);
      }

      values.push(id);
      await this.db.query(
        `UPDATE credentials SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    } else {
      const index = this.credentials.findIndex(c => c.id === id);
      if (index !== -1) {
        this.credentials[index] = { ...this.credentials[index], ...updates };
        this.saveJSON();
      }
    }
  }

  // Delete credential
  async delete(id) {
    if (this.useDatabase) {
      await this.db.query('DELETE FROM credentials WHERE id = $1', [id]);
    } else {
      const index = this.credentials.findIndex(c => c.id === id);
      if (index !== -1) {
        this.credentials.splice(index, 1);
        this.saveJSON();
      }
    }
  }

  // Update order of all credentials
  async updateOrder(orderArray) {
    if (this.useDatabase) {
      for (let i = 0; i < orderArray.length; i++) {
        await this.db.query('UPDATE credentials SET "order" = $1 WHERE id = $2', [i, orderArray[i]]);
      }
    } else {
      orderArray.forEach((id, index) => {
        const cred = this.credentials.find(c => c.id === id);
        if (cred) {
          cred.order = index;
        }
      });
      this.saveJSON();
    }
  }
}

module.exports = Storage;
