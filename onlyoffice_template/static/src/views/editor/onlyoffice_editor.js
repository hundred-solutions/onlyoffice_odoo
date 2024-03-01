/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { EditorComponent } from "./onlyoffice_editor_component";

const { Component, useState, onMounted, onWillUnmount } = owl;

class TemplateEditor extends Component {
    setup() {
        super.setup();
        this.orm = useService("orm");
        this.rpc = useService("rpc");
        this.viewService = useService("view");
        this.EditorComponent = EditorComponent;

        this.state = useState({
            docApiJS: null,
            config: null,
            models: [],
            visibleModels: [],
            searchString: "",
        });

        this.env.bus.on("onlyoffice-template-field-click", this, (field) => this.onFieldClick(field));

        onMounted(async () => {
            try {
                const models = JSON.parse(await this.orm.call("onlyoffice.template", "get_fields_for_model", [this.props.template_model_model]));
                this.state.models = this.formatModels(models);
                this.state.visibleModels = this.state.models;

                const response = await this.rpc(`/onlyoffice/template/editor`, {
                    attachment_id: this.props.attachment_id[0]
                });
                const config = JSON.parse(response.editorConfig);
                config.editorConfig.customization.submitForm = false; // TODO: save as pdf
                config.events = {
                    /*onRequestSaveAs: async (event) => {
                        await this.rpc(`/onlyoffice/template/upload`, {
                            data: {
                                url: event.data.url,
                                name: event.data.title,
                                template_model_model: this.props.template_model_model
                            }
                        });
                    },*/
                    onDocumentReady: () => {
                        window.connector = docEditor.createConnector();
                    }
                };
                this.state.config = config;

                this.state.docApiJS = response.docApiJS;
                if (!window.DocsAPI) {
                    await this.loadDocsAPI(this.state.docApiJS);
                }
                if (window.DocsAPI) {
                    window.docEditor = new DocsAPI.DocEditor("doceditor", this.state.config);
                } else {
                    throw new Error("window.DocsAPI is null")
                }
            } catch (error) {
                console.error("onMounted TemplateEditor error:", error);
                document.getElementById("error").classList.remove("d-none");
            }
        });

        this.script = null;
        onWillUnmount(() => {
            if (window.connector) {
                window.connector.disconnect();
                delete window.connector;
            }
            if (window.docEditor) {
                window.docEditor.destroyEditor();
                delete window.docEditor;
            }
            if (this.script && this.script.parentNode) {
                this.script.parentNode.removeChild(this.script);
            }
            if (window.DocsAPI) {
                delete window.DocsAPI;
            }
            this.env.bus.off("onlyoffice-template-field-click", this);
        })
    }

    async loadDocsAPI(DocsAPI) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = DocsAPI;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
            this.script = script;
        });
    }

    formatModels(models) {
        function createNestedObject(base, names, value) {
            let currentStep = base;
            names.forEach((name, index) => {
                let existingChild = currentStep.children.find(child => child.name === name);
                if (!existingChild) {
                    existingChild = { name, children: [] };
                    currentStep.children.push(existingChild);
                }
                currentStep = existingChild;
    
                if (index === names.length - 1) {
                    existingChild.fields = value.fields;
                    existingChild.fullname = value.fullname;
                }
            });
        }
    
        function buildHierarchy(objects) {
            let root = { children: [] };
            objects.forEach(obj => {
                let parts = obj.name.split(".");
                createNestedObject(root, parts, obj);
            });
            return root.children;
        }
    
        function simplifyStructure(hierarchy) {
            return hierarchy.map(node => {
                if (node.children.length === 0) {
                    delete node.children;
                } else {
                    node.children = simplifyStructure(node.children);
                }
                return node;
            });
        }
    
        let hierarchy = buildHierarchy(models);
        return simplifyStructure(hierarchy);
    }

    setModelsFilter() {
        const searchAndExpand = (items) => {
            return items.reduce((acc, item) => {
                const fields = item.fields || [];
                const matchingFields = fields.filter(field => field.string.toLowerCase().includes(this.state.searchString.toLowerCase()));
                const matchInFields = matchingFields.length > 0;
    
                let children = item.children ? searchAndExpand(item.children) : [];
                const matchInChildren = children.length > 0;
    
                if (matchInFields || matchInChildren) {
                    acc.push({
                        ...item,
                        expanded: matchInFields || matchInChildren,
                        fields: matchingFields,
                        children,
                    });
                }
                return acc;
            }, []);
        }
        this.state.visibleModels = searchAndExpand(this.state.models);
    }

    onCleanSearchClick() {
        this.state.searchString = "";
        this.state.visibleModels = this.state.models;
    }

    onSearchInput() {
        if (this.state.searchString) {
            this.setModelsFilter();
        } else {
            this.onCleanSearchClick();
        }
    }

    onFieldClick(field) {
        if (window.connector) {
            const type = field.type;
            // TODO: add create image and other form 
            if (type === "char" ||
                type === "text" ||
                type === "selection" ||
                type === "integer" ||
                type === "float" ||
                type === "monetary" ||
                type === "date" ||
                type === "datetime" ||
                type === "many2one" ||
                type === "one2many" ||
                type === "many2many") {
                this.createTextForm(field);
            }
            if (type === "boolean") {
                this.createCheckBoxForm(field);
            }
        }
    }

    createTextForm = (data) => {
        Asc.scope.data = data;
        window.connector.callCommand(() => {
            var oDocument = Api.GetDocument();
            var oTextForm = Api.CreateTextForm({
                "key": Asc.scope.data.name,
                "placeholder": Asc.scope.data.string,
                "tip": Asc.scope.data.string,
                "tag": Asc.scope.data.model
            });
            var oParagraph = Api.CreateParagraph();
            oParagraph.AddElement(oTextForm);
            oDocument.InsertContent([oParagraph], true, { "KeepTextOnly": true });
            
        });
    }

    createCheckBoxForm = (data) => {
        Asc.scope.data = data;
        window.connector.callCommand(() => {
            var oDocument = Api.GetDocument();
            var oCheckBoxForm = Api.CreateCheckBoxForm({
                "key": Asc.scope.data.name,
                "tip": Asc.scope.data.string,
                "tag": Asc.scope.data.model
            });
            oCheckBoxForm.ToInline();
            var oParagraph = Api.CreateParagraph();
            oParagraph.AddElement(oCheckBoxForm);
            oDocument.InsertContent([oParagraph], true, { "KeepTextOnly": true });
        });
    }
}
TemplateEditor.components = { 
    ...Component.components, 
    EditorComponent
};
TemplateEditor.template = "onlyoffice_template.TemplateEditor";

registry.category("actions").add("onlyoffice_template.TemplateEditor", TemplateEditor);