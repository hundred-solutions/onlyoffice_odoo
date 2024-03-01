/** @odoo-module **/
import { Component, useState, onWillUpdateProps } from '@odoo/owl';

export class EditorComponent extends Component {
    setup() {
        this.state = useState({
            isExpanded: Boolean(this.props.searchString) || false
        });
        onWillUpdateProps(nextProps => {
            this.state.isExpanded = Boolean(nextProps.searchString);
          });
    }
    toggleExpand() {
        this.state.isExpanded = !this.state.isExpanded;
    }

    onFieldClick(field) {
        this.env.bus.trigger("onlyoffice-template-field-click", field);
    }
}
EditorComponent.components = { 
    ...Component.components, 
    EditorComponent
};
EditorComponent.template = 'onlyoffice_template.EditorComponent';
EditorComponent.props = ['model', 'searchString', 'level'];