/* @flow */

import { MBQLObjectClause } from "./MBQLClause";

import StructuredQuery from "../StructuredQuery";
import Dimension, { JoinedDimension } from "metabase-lib/lib/Dimension";

import { TableId } from "metabase/meta/types/Table";
import type {
  Join as JoinObject,
  JoinStrategy,
  JoinFields,
  JoinAlias,
  JoinCondition,
  StructuredQuery as StructuredQueryObject,
} from "metabase/meta/types/Query";

import _ from "underscore";

const JOIN_STRATEGY_OPTIONS = [
  { value: "left-join", name: "Left outer join", icon: "join_left_outer" }, // default
  { value: "right-join", name: "Right outer join", icon: "join_right_outer" },
  { value: "inner-join", name: "Inner join", icon: "join_inner" },
  { value: "full-join", name: "Full outer join", icon: "join_full_outer" },
];

export default class Join extends MBQLObjectClause {
  strategy: ?JoinStrategy;
  alias: ?JoinAlias;
  condition: ?JoinCondition;
  fields: ?JoinFields;
  // "source-query": ?StructuredQueryObject;
  // "source-table": ?TableId;

  set(join: any): Join {
    // $FlowFixMe
    return super.set(join);
  }

  displayName() {
    const table = this.joinedTable();
    return table && table.displayName();
  }

  /**
   * Replaces the aggregation in the parent query and returns the new StructuredQuery
   */
  replace(join: Join | JoinObject): StructuredQuery {
    return this._query.updateJoin(this._index, join);
  }

  // SOURCE TABLE
  joinSourceTableId(): ?TableId {
    // $FlowFixMe
    return this["source-table"];
  }
  setJoinSourceTableId(
    tableId: TableId,
    { defaultCondition = true }: { defaultCondition?: boolean } = {},
  ) {
    // $FlowFixMe
    if (tableId !== this["source-table"]) {
      const table = this.metadata().table(tableId);
      const join = this.set({
        ...this,
        "source-query": undefined,
        "source-table": tableId,
        alias: this._uniqueAlias((table && table.name) || `table_${tableId}`),
        condition: null,
      });
      if (defaultCondition) {
        return join.setDefaultCondition();
      } else {
        return join;
      }
    }
  }

  // SOURCE QUERY
  joinSourceQuery(): ?StructuredQueryObject {
    // $FlowFixMe
    return this["source-query"];
  }
  setJoinSourceQuery(query: StructuredQuery) {
    return this.set({
      ...this,
      "source-table": undefined,
      "source-query": query,
      alias: this._uniqueAlias("source"),
      condition: null,
    });
  }

  _uniqueAlias(name: JoinAlias) {
    const usedAliases = new Set(
      this.query()
        .joins()
        .map(join => join.alias)
        .filter(alias => alias !== this.alias),
    );

    // alias can't be same as parent table name either
    const parentTable = this.parentTable();
    if (parentTable) {
      usedAliases.add(parentTable.name);
    }

    for (let index = 1; ; index++) {
      const alias = index === 1 ? name : `${name}_${index}`;
      if (!usedAliases.has(alias)) {
        return alias;
      }
    }
  }

  // FIELDS
  setFields(fields: JoinFields) {
    return this.set({ ...this, fields });
  }

  // STRATEGY
  setStrategy(strategy: JoinStrategy) {
    return this.set({ ...this, strategy });
  }
  strategyOption() {
    return this.strategy
      ? _.findWhere(this.strategyOptions(), { value: this.strategy })
      : JOIN_STRATEGY_OPTIONS[0];
  }
  strategyOptions() {
    const database = this.query().database();
    if (!database) {
      return [];
    }
    return JOIN_STRATEGY_OPTIONS.filter(({ value }) =>
      database.hasFeature(value),
    );
  }

  // CONDITION
  setCondition(condition: JoinCondition): Join {
    return this.set({ ...this, condition });
  }
  setDefaultCondition() {
    const { dimensions } = this.parentDimensionOptions();
    // look for foreign keys linking the two tables
    const joinedTable = this.joinedTable();
    if (joinedTable && joinedTable.id != null) {
      const fk = _.find(dimensions, d => {
        const { target } = d.field();
        return target && target.table && target.table.id === joinedTable.id;
      });
      if (fk) {
        return this.setParentDimension(fk).setJoinDimension(
          this.joinedDimension(fk.field().target.dimension()),
        );
      }
    }
    return this;
  }

  // simplified "=" join condition helpers:

  // NOTE: parentDimension refers to the left-hand side of the join,
  // and joinDimension refers to the right-hand side
  // TODO: should we rename them to lhsDimension/rhsDimension etc?

  parentDimension() {
    const { condition } = this;
    if (Array.isArray(condition) && condition[0] === "=" && condition[1]) {
      return this.query().parseFieldReference(condition[1]);
    }
  }
  parentDimensionOptions() {
    const query = this.query();
    const dimensions = query.dimensions();
    const options = {
      count: dimensions.length,
      dimensions: dimensions,
      fks: [],
    };
    // add all previous joined fields
    const joins = query.joins();
    for (let i = 0; i < this.index(); i++) {
      const fkOptions = joins[i].joinedDimensionOptions();
      options.count += fkOptions.count;
      options.fks.push(fkOptions);
    }
    return options;
  }
  setParentDimension(dimension: Dimension): Join {
    if (dimension instanceof Dimension) {
      dimension = dimension.mbql();
    }
    const joinDimension = this.joinDimension();
    return this.setCondition([
      "=",
      dimension,
      joinDimension instanceof Dimension ? joinDimension.mbql() : null,
    ]);
  }

  joinDimension() {
    const { condition } = this;
    if (Array.isArray(condition) && condition[0] === "=" && condition[2]) {
      const joinedQuery = this.joinedQuery();
      return joinedQuery && joinedQuery.parseFieldReference(condition[2]);
    }
  }
  setJoinDimension(dimension: Dimension): Join {
    if (dimension instanceof Dimension) {
      dimension = dimension.mbql();
    }
    const parentDimension = this.parentDimension();
    // $FlowFixMe
    return this.setCondition([
      "=",
      parentDimension instanceof Dimension ? parentDimension.mbql() : null,
      dimension,
    ]);
  }
  joinDimensionOptions() {
    const dimensions = this.joinedDimensions();
    return {
      count: dimensions.length,
      dimensions: dimensions,
      fks: [],
    };
  }

  // HELPERS

  joinedQuery() {
    const sourceTable = this.joinSourceTableId();
    const sourceQuery = this.joinSourceQuery();
    return sourceTable
      ? new StructuredQuery(this.query().question(), {
          type: "query",
          query: { "source-table": sourceTable },
        })
      : sourceQuery
      ? new StructuredQuery(this.query().question(), {
          type: "query",
          query: sourceQuery,
        })
      : null;
  }
  joinedTable() {
    const joinedQuery = this.joinedQuery();
    return joinedQuery && joinedQuery.table();
  }
  parentQuery() {
    return this.query();
  }
  parentTable() {
    const parentQuery = this.parentQuery();
    return parentQuery && parentQuery.table();
  }

  /**
   * All possible joined dimensions
   */
  joinedDimensions() {
    const table = this.joinedTable();
    return table
      ? table.dimensions().map(dimension => this.joinedDimension(dimension))
      : [];
  }

  /**
   * Currently selected joined dimensions
   */
  fieldsDimensions() {
    if (this.fields === "all") {
      return this.joinedDimensions();
    } else if (Array.isArray(this.fields)) {
      return this.fields.map(f => this.query().parseFieldReference(f));
    } else {
      return [];
    }
  }

  joinedDimensionOptions(
    dimensionFilter: (d: Dimension) => boolean = () => true,
  ) {
    const dimensions = this.joinedDimensions().filter(dimensionFilter);
    return {
      name: this.displayName(),
      icon: "join_left_outer",
      dimensions: dimensions,
      fks: [],
      count: dimensions.length,
    };
  }

  joinedDimension(dimension: Dimension) {
    return new JoinedDimension(
      dimension,
      [this.alias],
      this.metadata(),
      this.query(),
    );
  }

  dependentTableIds() {
    const joinedQuery = this.joinedQuery();
    return joinedQuery
      ? joinedQuery.dependentTableIds({ includeFKs: false })
      : [];
  }

  /**
   * Removes the aggregation in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeJoin(this._index);
  }

  isValid(): boolean {
    return !!(
      this.joinedTable() &&
      this.parentDimension() &&
      this.joinDimension()
    );
  }
}
