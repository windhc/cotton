import { Adapter, DatabaseResult } from "../adapters/adapter.ts";
import { range } from "../utils/number.ts";
import { RelationType } from "./fields.ts";
import {
  getColumns,
  getRelations,
  extractRelationalRecord,
  createModel,
  createModels,
  normalizeModel,
  mapRelationalResult,
  getTableName,
  setSaved,
  isSaved,
  compareWithOriginal,
  getValues,
  getPrimaryKeyInfo,
  getPrimaryKey,
  setPrimaryKey,
  ModelValues,
} from "../utils/models.ts";
import { quote } from "../utils/dialect.ts";

export type ExtendedModel<T> = { new (): T } & typeof Model;

export interface FindOptions<T> {
  limit?: number;
  offset?: number;
  where?: Partial<T>;
  includes?: string[];
}

/**
 * Database model
 */
export abstract class Model {
  static adapter: Adapter;

  /**
   * Search for a single instance. Returns the first instance found, or null if none can be found
   */
  public static async findOne<T extends Model>(
    this: ExtendedModel<T>,
    options?: FindOptions<T>,
  ): Promise<T | null> {
    // Initialize query builder
    const query = this.adapter.table(getTableName(this));

    // Add where clauses (if exists)
    if (options && options.where) {
      const columns = getColumns(this);

      for (const [column, value] of Object.entries(options.where)) {
        // TODO: allow user to use different operator
        query.where(
          columns.find((item) => item.propertyKey === column)?.name || column,
          value,
        );
      }
    }

    // Add maximum number of records (if exists)
    if (options && options.limit) {
      query.limit(options.limit);
    }

    // Add offset (if exists)
    if (options && options.offset) {
      query.offset(options.offset);
    }

    if (options && options.includes) {
      const relations = getRelations(this, options.includes);
      for (const relation of relations) {
        const tableName = getTableName(relation.getModel());
        const primaryKey = getPrimaryKeyInfo(relation.getModel()).name;

        if (relation.type === RelationType.HasMany) {
          const columnA = tableName + "." + relation.targetColumn;
          const columnB = getTableName(this) + "." + primaryKey;
          query.leftJoin(tableName, columnA, columnB);
        } else if (relation.type === RelationType.BelongsTo) {
          const columnA = tableName + "." + primaryKey;
          const columnB = getTableName(this) + "." + relation.targetColumn;
          query.leftJoin(tableName, columnA, columnB);
        }

        const columnNames = getColumns(relation.getModel())
          .map((item): [string, string] => [
            tableName + "." + item.name,
            tableName + "__" + item.name,
          ]);
        query.select(...columnNames);
      }
    }

    // Select all columns
    const columnNames = getColumns(this)
      .map((item): [string, string] => [
        getTableName(this) + "." + item.name,
        getTableName(this) + "__" + item.name,
      ]);
    query.select(...columnNames);

    let result: any[];

    // If the `includes` option contains a "Has Many" relationship,
    // we need to get the record primary key first, then, we can fetch
    // the whole data.
    if (
      options && options.includes &&
      getRelations(this, options.includes).find((item) =>
        item.type === RelationType.HasMany
      )
    ) {
      // Get the primary key column name
      const primaryKey = getTableName(this) + "__" +
        getPrimaryKeyInfo(this).name;

      // Get the distinct query
      const alias = quote("distinctAlias", this.adapter.dialect);
      const primaryColumnName = quote(primaryKey, this.adapter.dialect);
      const { text, values } = query.toSQL();
      const queryString = `SELECT ${alias}.${primaryColumnName} FROM (${
        text.slice(0, text.length - 1)
      }) ${alias} LIMIT 1;`;

      // Execute the distinct query
      const recordIds = await this.adapter.query(
        queryString,
        values,
      );

      // If the record found, fetch the relations
      if (recordIds.length === 1) {
        result = await query
          .where("id", recordIds[0][primaryKey])
          .execute();
      } else {
        return null;
      }
    } else {
      result = await query.first().execute();
    }

    // If the record is not found, return null.
    // Otherwise, return the model instance with the data
    if (result.length < 1) {
      return null;
    } else {
      let record: ModelValues;

      if (options && Array.isArray(options.includes)) {
        record = mapRelationalResult(
          this,
          options.includes,
          result,
        )[0] as ModelValues;
      } else {
        record = extractRelationalRecord(result[0], this);
      }

      return createModel(this, record, true);
    }
  }

  /**
   * Search for multiple instance
   * 
   * @param options query options
   */
  public static async find<T extends Model>(
    this: ExtendedModel<T>,
    options?: FindOptions<T>,
  ): Promise<T[]> {
    // Initialize query builder
    const query = this.adapter.table(getTableName(this));

    // Add where clauses (if exists)
    if (options && options.where) {
      const columns = getColumns(this);

      for (const [column, value] of Object.entries(options.where)) {
        // TODO: allow user to use different operator
        query.where(
          columns.find((item) => item.propertyKey === column)?.name || column,
          value,
        );
      }
    }

    // Add maximum number of records (if exists)
    if (options && options.limit) {
      query.limit(options.limit);
    }

    // Add offset (if exists)
    if (options && options.offset) {
      query.offset(options.offset);
    }

    if (options && options.includes) {
      const relations = getRelations(this, options.includes);
      for (const relation of relations) {
        const tableName = getTableName(relation.getModel());
        const primaryKey = getPrimaryKeyInfo(this).name;

        if (relation.type === RelationType.HasMany) {
          const columnA = tableName + "." + relation.targetColumn;
          const columnB = getTableName(this) + "." + primaryKey;
          query.leftJoin(tableName, columnA, columnB);
        } else if (relation.type === RelationType.BelongsTo) {
          const columnA = tableName + "." + primaryKey;
          const columnB = getTableName(this) + "." + relation.targetColumn;
          query.leftJoin(tableName, columnA, columnB);
        }

        const columnNames = getColumns(relation.getModel())
          .map((item): [string, string] => [
            tableName + "." + item.name,
            tableName + "__" + item.name,
          ]);
        query.select(...columnNames);
      }
    }

    // Select all columns
    const columnNames = getColumns(this)
      .map((item): [string, string] => [
        getTableName(this) + "." + item.name,
        getTableName(this) + "__" + item.name,
      ]);
    query.select(...columnNames);

    // Execute query
    const result = await query.execute();

    let records: ModelValues[];

    if (options && Array.isArray(options.includes)) {
      records = mapRelationalResult(this, options.includes, result);
    } else {
      records = result.map((item) => {
        return extractRelationalRecord(item, this);
      });
    }

    return createModels(this, records, true);
  }

  /**
   * Save model to the database
   */
  public async save(): Promise<this> {
    // Get the actual class to access static properties
    const modelClass = <typeof Model> this.constructor;

    // Normalize fields data
    normalizeModel(this);

    // Get the primary key column name
    const primaryKey = getPrimaryKeyInfo(modelClass).name;

    // If the primary key is defined, we assume that the user want to update the record.
    // Otherwise, create a new record to the database.
    if (isSaved(this)) {
      const { isDirty, changedFields } = compareWithOriginal(this);

      if (isDirty) {
        // Bind all values to the `data` variable
        const data = getValues(this, changedFields);

        // Save record to the database
        await modelClass.adapter
          .table(getTableName(modelClass))
          .where(primaryKey, getPrimaryKey(this))
          .update(data)
          .execute();
      }
    } else {
      // Bind all values to the `data` variable
      const data = getValues(this);

      // Save record to the database
      const query = modelClass.adapter
        .table(getTableName(modelClass))
        .insert(data);

      if (modelClass.adapter.dialect === "postgres") {
        query.returning(primaryKey);
      }

      const result = await query.execute();

      // Get last inserted id
      let lastInsertedId: number;

      if (modelClass.adapter.dialect === "postgres") {
        lastInsertedId = result[result.length - 1][primaryKey] as number;
      } else {
        lastInsertedId = modelClass.adapter.lastInsertedId;
      }

      // Set the primary key
      setPrimaryKey(this, lastInsertedId);
    }

    setSaved(this, true);

    return this;
  }

  /**
   * Delete model from the database
   */
  public async remove(): Promise<void> {
    // Get the actual class to access static properties
    const modelClass = <typeof Model> this.constructor;

    // Delete from the database
    await modelClass.adapter.table(getTableName(modelClass))
      .where(getPrimaryKeyInfo(modelClass).name, getPrimaryKey(this))
      .delete()
      .execute();

    setSaved(this, false);
  }

  /**
   * Create a model instance and save it to the database.
   * 
   * @param data record data
   */
  public static async insert<T extends Model>(
    this: ExtendedModel<T>,
    data: Partial<T>,
  ): Promise<T>;

  /**
   * Create a model instance and save it to the database.
   * 
   * @param data array of records
   */
  public static async insert<T extends Model>(
    this: ExtendedModel<T>,
    data: Partial<T>[],
  ): Promise<T[]>;

  /**
   * Create a model instance and save it to the database.
   * 
   * @param data model fields
   */
  public static async insert<T extends Model>(
    this: ExtendedModel<T>,
    data: Partial<T> | Partial<T>[],
  ): Promise<T | T[]> {
    if (Array.isArray(data)) {
      const models = createModels<T>(this, data as ModelValues[]);
      return this._bulkSave<T>(models);
    } else {
      const model = createModel<T>(this, data as ModelValues);
      await model.save();
      return model;
    }
  }

  /**
   * Save multiple records to the database efficiently
   */
  private static async _bulkSave<T extends Model>(models: T[]): Promise<T[]> {
    // Get all model values
    const values = models.map((model) => getValues(model));

    // Get the primary key column name
    const primaryKey = getPrimaryKeyInfo(this).name;

    // Execute query
    const query = this.adapter
      .table(getTableName(this))
      .insert(values);

    if (this.adapter.dialect === "postgres") {
      query.returning(primaryKey);
    }

    const result = await query.execute();

    // Get last inserted id
    let lastInsertedId: number;

    if (this.adapter.dialect === "postgres") {
      lastInsertedId = result[result.length - 1][primaryKey] as number;
    } else {
      lastInsertedId = this.adapter.lastInsertedId;
    }

    // Set the model primary keys
    const ids = range(
      lastInsertedId + 1 - models.length,
      lastInsertedId,
    );
    models.forEach((model, index) => {
      setPrimaryKey(model, ids[index]);
      setSaved(model, true);
    });

    return models;
  }

  /**
   * Delete a single record by id
   */
  public static async deleteOne<T extends Model>(
    this: ExtendedModel<T>,
    id: number,
  ): Promise<void> {
    // TODO: Add options to query using where clause
    await this.adapter.table(getTableName(this))
      .where(getPrimaryKeyInfo(this).name, id)
      .delete()
      .execute();
  }

  /**
   * Delete multiple records
   * 
   * @param options query options
   */
  public static async delete<T extends Model>(
    this: ExtendedModel<T>,
    options: FindOptions<T>,
  ): Promise<void> {
    // Initialize query builder
    const query = this.adapter.table(getTableName(this));

    // Add where clauses (if exists)
    if (options && options.where) {
      const columns = getColumns(this);

      for (const [column, value] of Object.entries(options.where)) {
        // TODO: allow user to use different operator
        query.where(
          columns.find((item) => item.propertyKey === column)?.name || column,
          value,
        );
      }
    } else {
      throw new Error(
        "Cannot perform delete without where clause, use `truncate` to delete all records!",
      );
    }

    if (options && options.limit) {
      query.limit(options.limit);
    }

    if (options && options.offset) {
      query.offset(options.offset);
    }

    // Execute query
    await query.delete().execute();
  }

  /**
   * Remove all records from a table.
   */
  public static async truncate(): Promise<void> {
    // sqlite TRUNCATE is a different command
    const truncateCommand = this.adapter.dialect === "sqlite"
      ? "DELETE FROM"
      : "TRUNCATE";

    // Surround table name with quote
    const tableName = quote(getTableName(this), this.adapter.dialect);

    await this.adapter.query(`${truncateCommand} ${tableName};`);
  }
}
