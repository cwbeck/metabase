import React, { Component } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { t } from "ttag";
import AccordionList from "metabase/components/AccordionList.jsx";
import FieldList from "./FieldList.jsx";
import QueryDefinitionTooltip from "./QueryDefinitionTooltip.jsx";

import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import Button from "metabase/components/Button.jsx";

import * as Q_DEPRECATED from "metabase/lib/query";
import * as A_DEPRECATED from "metabase/lib/query_aggregation";

import Aggregation from "metabase-lib/lib/queries/structured/Aggregation";

import _ from "underscore";

import ExpressionEditorTextfield from "./expressions/ExpressionEditorTextfield.jsx";

const COMMON_SECTION_NAME = t`Common Metrics`;
const BASIC_SECTION_NAME = t`Basic Metrics`;
const CUSTOM_SECTION_NAME = t`Custom Expression`;

const COMMON_AGGREGATIONS = new Set(["count"]);

export default class AggregationPopover extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      aggregation: props.aggregation || [],
      choosingField:
        props.aggregation &&
        props.aggregation.length > 1 &&
        A_DEPRECATED.isStandard(props.aggregation),
      editingAggregation:
        props.aggregation &&
        props.aggregation.length > 1 &&
        (A_DEPRECATED.isCustom(props.aggregation) ||
          A_DEPRECATED.isNamed(props.aggregation)),
    };

    _.bindAll(
      this,
      "commitAggregation",
      "onPickAggregation",
      "onPickField",
      "onClearAggregation",
    );
  }

  static propTypes = {
    aggregation: PropTypes.array,
    onChangeAggregation: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,

    query: PropTypes.object,

    // passing a dimension disables the field picker and only shows relevant aggregations
    dimension: PropTypes.object,

    // DEPRECATED: replaced with `query`
    tableMetadata: PropTypes.object,
    customFields: PropTypes.object,
    datasetQuery: PropTypes.object,

    availableAggregations: PropTypes.array,

    showCustom: PropTypes.bool,
    showMetrics: PropTypes.bool,
    showRawData: PropTypes.bool,

    width: PropTypes.number,
  };

  static defaultProps = {
    showCustom: true,
    showMetrics: true,
    width: 300,
  };

  componentDidUpdate() {
    if (this._header) {
      const { height } = ReactDOM.findDOMNode(
        this._header,
      ).getBoundingClientRect();
      if (height !== this.state.headerHeight) {
        this.setState({ headerHeight: height });
      }
    }
  }

  commitAggregation(aggregation) {
    this.props.onChangeAggregation(aggregation);
    if (this.props.onClose) {
      this.props.onClose();
    }
  }

  _getAggregation() {
    const { aggregation, query } = this.props;
    if (aggregation && !(aggregation instanceof Aggregation)) {
      return new Aggregation(aggregation, null, query);
    } else {
      return aggregation;
    }
  }

  onPickAggregation(item) {
    const { dimension } = this.props;
    const aggregation = this._getAggregation();

    if (dimension) {
      if (item.aggregation && item.aggregation.requiresField) {
        this.commitAggregation(
          A_DEPRECATED.setField(item.value, dimension.mbql()),
        );
      }
    } else if (item.custom) {
      // use the existing aggregation if it's valid
      const value = aggregation && aggregation.isValid() ? aggregation : null;
      this.setState({
        aggregation: value,
        editingAggregation: true,
      });
    } else if (item.aggregation && item.aggregation.requiresField) {
      // check if this aggregation requires a field, if so then force user to pick that now, otherwise we are done
      this.setState({
        aggregation: item.value,
        choosingField: true,
      });
    } else {
      // this includse picking a METRIC or picking an aggregation which doesn't require a field
      this.commitAggregation(item.value);
    }
  }

  onPickField(fieldId) {
    this.commitAggregation(
      A_DEPRECATED.setField(this.state.aggregation, fieldId),
    );
  }

  onClearAggregation() {
    this.setState({
      choosingField: false,
      editingAggregation: false,
    });
  }

  _getTableMetadata() {
    const { query, tableMetadata } = this.props;
    return tableMetadata || query.tableMetadata();
  }

  _getAvailableAggregations() {
    const { availableAggregations, query, dimension, showRawData } = this.props;
    return (
      availableAggregations ||
      (dimension && dimension.aggregations()) ||
      query.table().aggregations()
    ).filter(agg => showRawData || agg.short !== "rows");
  }

  _getCustomFields() {
    const { customFields, datasetQuery, query } = this.props;
    return (
      customFields ||
      (datasetQuery && Q_DEPRECATED.getExpressions(datasetQuery.query)) ||
      (query && query.expressions())
    );
  }

  itemIsSelected(item) {
    const { aggregation } = this.props;
    return item.isSelected(A_DEPRECATED.getContent(aggregation));
  }

  renderItemExtra(item, itemIndex) {
    if (item.aggregation && item.aggregation.description) {
      return (
        <div className="p1">
          <Tooltip tooltip={item.aggregation.description}>
            <span className="QuestionTooltipTarget" />
          </Tooltip>
        </div>
      );
    } else if (item.metric) {
      return this.renderMetricTooltip(item.metric);
    }
  }

  renderMetricTooltip(metric) {
    return (
      <div className="p1">
        <Tooltip
          tooltip={
            <QueryDefinitionTooltip
              type="metric"
              object={metric}
              tableMetadata={this._getTableMetadata()}
              customFields={this._getCustomFields()}
            />
          }
        >
          <span className="QuestionTooltipTarget" />
        </Tooltip>
      </div>
    );
  }

  render() {
    let {
      query,
      dimension,
      showCustom,
      showMetrics,
      alwaysExpanded,
    } = this.props;

    const tableMetadata = this._getTableMetadata();
    const customFields = this._getCustomFields();
    const availableAggregations = this._getAvailableAggregations();

    if (dimension) {
      showCustom = false;
      showMetrics = false;
    }
    if (tableMetadata.db.features.indexOf("expression-aggregations") < 0) {
      showCustom = false;
    }

    const { choosingField, editingAggregation } = this.state;
    const aggregation = A_DEPRECATED.getContent(this.state.aggregation);

    let selectedAggregation;
    if (A_DEPRECATED.isMetric(aggregation)) {
      selectedAggregation = _.findWhere(tableMetadata.metrics, {
        id: A_DEPRECATED.getMetric(aggregation),
      });
    } else if (A_DEPRECATED.getOperator(aggregation)) {
      selectedAggregation = _.findWhere(availableAggregations, {
        short: A_DEPRECATED.getOperator(aggregation),
      });
    }

    const aggregationItems = availableAggregations.map(aggregation => ({
      name: dimension
        ? aggregation.name.replace("of ...", "")
        : aggregation.name,
      value: [aggregation.short, ...aggregation.fields.map(field => null)],
      isSelected: agg =>
        !A_DEPRECATED.isCustom(agg) &&
        A_DEPRECATED.getAggregation(agg) === aggregation.short,
      aggregation: aggregation,
    }));

    // we only want to consider active metrics, with the ONE exception that if the currently selected aggregation is a
    // retired metric then we include it in the list to maintain continuity
    const metrics =
      showMetrics && tableMetadata.metrics
        ? tableMetadata.metrics.filter(
            metric =>
              !metric.archived ||
              (selectedAggregation && selectedAggregation.id === metric.id),
          )
        : [];
    const metricItems = metrics.map(metric => ({
      name: metric.name,
      value: ["metric", metric.id],
      isSelected: aggregation =>
        A_DEPRECATED.getMetric(aggregation) === metric.id,
      metric: metric,
    }));

    const sections = [];
    // "Basic Metrics", e.x. count, sum, avg, etc
    if (aggregationItems.length > 0) {
      sections.push({
        name: BASIC_SECTION_NAME,
        icon: "table2",
        items: aggregationItems,
      });
    }
    // "Common Metrics" a.k.a. saved metrics
    if (metricItems.length > 0) {
      sections.push({
        name: COMMON_SECTION_NAME,
        icon: "star_outline",
        items: metricItems,
      });
    }

    // slightly different layout of "basic" and "common" metrics for alwaysExpanded=true
    if (alwaysExpanded && sections.length > 1) {
      const [commonAggregationItems, basicAggregationItems] = _.partition(
        aggregationItems,
        item => COMMON_AGGREGATIONS.has(item.aggregation.short),
      );
      // move COMMON_AGGREGATIONS into the "common metrics" section
      sections[0].items = basicAggregationItems;
      sections[1].items = [...commonAggregationItems, ...metricItems];
      // swap the order of the sections so "common metrics" are first
      sections.reverse();
    }

    if (showCustom) {
      // add "custom" as it's own section
      sections.push({
        name: CUSTOM_SECTION_NAME,
        icon: "sum",
        custom: true,
      });
      if (alwaysExpanded) {
        sections[sections.length - 1].items = [
          {
            name: t`Custom…`,
            custom: true,
            isSelected: agg => A_DEPRECATED.isCustom(agg),
          },
        ];
      }
    }

    if (sections.length === 1) {
      sections[0].name = null;
    }

    if (editingAggregation) {
      return (
        <div style={{ width: editingAggregation ? 500 : 300 }}>
          <div className="text-medium p1 py2 border-bottom flex align-center">
            <a
              className="cursor-pointer flex align-center"
              onClick={this.onClearAggregation}
            >
              <Icon name="chevronleft" size={18} />
              <h3 className="inline-block pl1">{CUSTOM_SECTION_NAME}</h3>
            </a>
          </div>
          <div className="p1">
            <ExpressionEditorTextfield
              startRule="aggregation"
              expression={aggregation}
              tableMetadata={tableMetadata}
              customFields={customFields}
              onChange={parsedExpression =>
                this.setState({
                  aggregation: A_DEPRECATED.setContent(
                    this.state.aggregation,
                    parsedExpression,
                  ),
                  error: null,
                })
              }
              onError={errorMessage =>
                this.setState({
                  error: errorMessage,
                })
              }
            />
            {this.state.error != null &&
              (Array.isArray(this.state.error) ? (
                this.state.error.map(error => (
                  <div
                    className="text-error mb1"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {error.message}
                  </div>
                ))
              ) : (
                <div className="text-error mb1">{this.state.error.message}</div>
              ))}
            <input
              className="input block full my1"
              value={A_DEPRECATED.getName(this.state.aggregation)}
              onChange={e =>
                this.setState({
                  aggregation: e.target.value
                    ? A_DEPRECATED.setName(aggregation, e.target.value)
                    : aggregation,
                })
              }
              placeholder={t`Name (optional)`}
            />
            <Button
              className="full"
              primary
              disabled={this.state.error}
              onClick={() => this.commitAggregation(this.state.aggregation)}
            >
              {t`Done`}
            </Button>
          </div>
        </div>
      );
    } else if (choosingField) {
      const [agg, fieldId] = aggregation;
      return (
        <div style={{ minWidth: 300 }}>
          <div
            ref={_ => (this._header = _)}
            className="text-medium p1 py2 border-bottom flex align-center"
          >
            <a
              className="cursor-pointer flex align-center"
              onClick={this.onClearAggregation}
            >
              <Icon name="chevronleft" size={18} />
              <h3 className="inline-block pl1">{selectedAggregation.name}</h3>
            </a>
          </div>
          <FieldList
            className={"text-green"}
            width={this.props.width}
            maxHeight={this.props.maxHeight - (this.state.headerHeight || 0)}
            table={tableMetadata}
            field={fieldId}
            fieldOptions={query.aggregationFieldOptions(agg)}
            customFieldOptions={customFields}
            onFieldChange={this.onPickField}
            enableSubDimensions={false}
          />
        </div>
      );
    } else {
      return (
        <AccordionList
          className="text-green"
          width={this.props.width}
          maxHeight={this.props.maxHeight}
          alwaysExpanded={this.props.alwaysExpanded}
          sections={sections}
          onChange={this.onPickAggregation}
          itemIsSelected={this.itemIsSelected.bind(this)}
          renderSectionIcon={s => <Icon name={s.icon} size={18} />}
          renderItemExtra={this.renderItemExtra.bind(this)}
          getItemClassName={item =>
            item.metric && item.metric.archived ? "text-medium" : null
          }
          onChangeSection={(section, sectionIndex) => {
            if (section.custom) {
              this.onPickAggregation({ custom: true });
            }
          }}
        />
      );
    }
  }
}
