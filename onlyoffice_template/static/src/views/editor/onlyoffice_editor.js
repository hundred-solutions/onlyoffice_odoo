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
      models: {},
      unchangedModels: {},
      searchString: "",
    });

    this.env.bus.on("onlyoffice-template-field-click", this, (field) => this.onFieldClick(field));

    onMounted(async () => {
      try {
        const models = JSON.parse(
          await this.orm.call("onlyoffice.template", "get_fields_for_model", [this.props.template_model_model]),
        );

        // Add keys
        const formattedModels = this.formatModels(models);
        this.state.models = formattedModels;
        this.state.unchangedModels = formattedModels;

        const response = await this.rpc(`/onlyoffice/template/editor`, {
          attachment_id: this.props.attachment_id[0],
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
          },
        };
        this.state.config = config;

        this.state.docApiJS = response.docApiJS;
        if (!window.DocsAPI) {
          await this.loadDocsAPI(this.state.docApiJS);
        }
        if (window.DocsAPI) {
          window.docEditor = new DocsAPI.DocEditor("doceditor", this.state.config);
        } else {
          throw new Error("window.DocsAPI is null");
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
    });
  }

  async loadDocsAPI(DocsAPI) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = DocsAPI;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
      this.script = script;
    });
  }

  formatModels(models, parentNames = []) {
    models.fields = models.fields.map((field) => {
      const key = [...parentNames, field.name].join(" ");
      field.key = key;
      if (field.related_model) {
        field.related_model = this.formatModels(field.related_model, [...parentNames, field.name]);
      }
      return field;
    }).sort((a, b) => (a.key > b.key ? 1 : -1));
    return models;
  }

  setModelsFilter() {
    const searchAndExpand = (models) => {
      const filteredFields = models.fields.filter(field => {
        if (field.key.split(' ').pop().includes(this.state.searchString)) {
          return true;
        } else if (field.related_model) {
          field.related_model = searchAndExpand(field.related_model, this.state.searchString);
          return field.related_model !== null;
        }
        return false;
      });
    
      if (filteredFields.length === 0) {
        return null;
      }
    
      return {
        ...models,
        fields: filteredFields
      };
    }
    const unchangedModels = structuredClone(this.state.unchangedModels);
    this.state.models = searchAndExpand(unchangedModels);
  }

  onCleanSearchClick() {
    this.state.searchString = "";
    this.state.models = this.state.unchangedModels;
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
      if (
        type === "char" ||
        type === "text" ||
        type === "selection" ||
        type === "integer" ||
        type === "float" ||
        type === "monetary" ||
        type === "date" ||
        type === "datetime" ||
        type === "many2one" ||
        type === "one2many" ||
        type === "many2many"
      ) {
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
        key: Asc.scope.data.key,
        placeholder: Asc.scope.data.string,
        tip: Asc.scope.data.string,
        tag: Asc.scope.data.model,
      });
      var oParagraph = Api.CreateParagraph();
      oParagraph.AddElement(oTextForm);
      oDocument.InsertContent([oParagraph], true, { KeepTextOnly: true });
    });
  };

  createCheckBoxForm = (data) => {
    Asc.scope.data = data;
    window.connector.callCommand(() => {
      var oDocument = Api.GetDocument();
      var oCheckBoxForm = Api.CreateCheckBoxForm({
        key: Asc.scope.data.key,
        tip: Asc.scope.data.string,
        tag: Asc.scope.data.model,
      });
      oCheckBoxForm.ToInline();
      var oParagraph = Api.CreateParagraph();
      oParagraph.AddElement(oCheckBoxForm);
      oDocument.InsertContent([oParagraph], true, { KeepTextOnly: true });
    });
  };
}
TemplateEditor.components = {
  ...Component.components,
  EditorComponent,
};
TemplateEditor.template = "onlyoffice_template.TemplateEditor";

registry.category("actions").add("onlyoffice_template.TemplateEditor", TemplateEditor);
