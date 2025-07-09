const db = require('../db/connection');
const logger = require('./logger');
const ErrorHandler = require('./errorHandler');

class DatabaseHelper {
  // Execute a query with error handling
  static async query(text, params = []) {
    try {
      const result = await db.query(text, params);
      return result;
    } catch (error) {
      logger.error('Database query error', error);
      throw error;
    }
  }

  // Execute a query and return a single row
  static async queryOne(text, params = []) {
    try {
      const result = await db.query(text, params);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Database query error', error);
      throw error;
    }
  }

  // Execute a query and return all rows
  static async queryAll(text, params = []) {
    try {
      const result = await db.query(text, params);
      return result.rows;
    } catch (error) {
      logger.error('Database query error', error);
      throw error;
    }
  }

  // Execute a transaction
  static async transaction(callback) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Check if a record exists
  static async exists(table, conditions) {
    const whereClause = Object.keys(conditions)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' AND ');
    
    const values = Object.values(conditions);
    const query = `SELECT 1 FROM ${table} WHERE ${whereClause} LIMIT 1`;
    
    try {
      const result = await db.query(query, values);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Database exists check error', error);
      throw error;
    }
  }

  // Count records
  static async count(table, conditions = {}) {
    let query = `SELECT COUNT(*) FROM ${table}`;
    const values = [];
    
    if (Object.keys(conditions).length > 0) {
      const whereClause = Object.keys(conditions)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(' AND ');
      query += ` WHERE ${whereClause}`;
      values.push(...Object.values(conditions));
    }
    
    try {
      const result = await db.query(query, values);
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error('Database count error', error);
      throw error;
    }
  }

  // Insert a record and return the inserted data
  static async insert(table, data, returning = '*') {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING ${returning}
    `;
    
    try {
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Database insert error', error);
      throw error;
    }
  }

  // Update a record
  static async update(table, data, conditions, returning = '*') {
    const setClause = Object.keys(data)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(', ');
    
    const whereClause = Object.keys(conditions)
      .map((key, index) => `${key} = $${Object.keys(data).length + index + 1}`)
      .join(' AND ');
    
    const values = [...Object.values(data), ...Object.values(conditions)];
    
    const query = `
      UPDATE ${table}
      SET ${setClause}
      WHERE ${whereClause}
      RETURNING ${returning}
    `;
    
    try {
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Database update error', error);
      throw error;
    }
  }

  // Delete records
  static async delete(table, conditions, returning = '*') {
    const whereClause = Object.keys(conditions)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' AND ');
    
    const values = Object.values(conditions);
    
    const query = `
      DELETE FROM ${table}
      WHERE ${whereClause}
      RETURNING ${returning}
    `;
    
    try {
      const result = await db.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Database delete error', error);
      throw error;
    }
  }

  // Pagination helper
  static async paginate(table, options = {}) {
    const {
      page = 1,
      limit = 10,
      where = {},
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = options;

    const offset = (page - 1) * limit;
    
    // Build WHERE clause
    let whereClause = '';
    const values = [];
    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(' AND ');
      whereClause = `WHERE ${conditions}`;
      values.push(...Object.values(where));
    }

    // Count total records
    const countQuery = `SELECT COUNT(*) FROM ${table} ${whereClause}`;
    const countResult = await db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated data
    const dataQuery = `
      SELECT * FROM ${table}
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    const dataResult = await db.query(dataQuery, [...values, limit, offset]);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }
}

module.exports = DatabaseHelper; 