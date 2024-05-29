/** @odoo-module **/
import { CANCEL_GLOBAL_CLICK, KanbanRecord } from "@web/views/kanban/kanban_record";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { useService } from "@web/core/utils/hooks";

export class OnlyofficeKanbanRecord extends KanbanRecord {
  setup() {
    super.setup();
    this.orm = useService("orm");
    this.actionService = useService("action");
  }

  /**
   * @override
   */
  triggerAction(params) {
    const env = this.env;
    const { group, list, openRecord, record } = this.props;
    const { type } = params;
    switch (type) {
      case "edit": {
        return openRecord(record, "edit");
      }
      case "delete": {
        const listOrGroup = group || list;
        if (listOrGroup.deleteRecords) {
          this.dialog.add(ConfirmationDialog, {
            body: env._t("Are you sure you want to delete this record?"),
            confirm: async () => {
              await listOrGroup.deleteRecords([record]);
              this.props.record.model.load();
              this.props.record.model.notify();
              return this.notification.add(env._t("Template removed"), {
                type: "info",
                sticky: false,
              });
            },
            cancel: () => {},
          });
        }
        return;
      }
      default: {
        return this.notification.add(env._t("Kanban: no action for type: ") + type, {
          type: "danger",
        });
      }
    }
  }

  /**
   * @override
   */
  async onGlobalClick(ev) {
    if (ev.target.closest(CANCEL_GLOBAL_CLICK) && !ev.target.classList.contains("o_onlyoffice_download")) {
      return;
    }
    if (ev.target.classList.contains("o_onlyoffice_download")) {
      window.location.href = `/onlyoffice/template/download/${this.props.record.data.attachment_id[0]}`;
      return;
    }
    return this.editTemplate();
  }

  async editTemplate() {
    const action = {
      type: "ir.actions.client",
      tag: "onlyoffice_template.TemplateEditor",
      target: "current",
    };
    return this.actionService.doAction(action, {
      props: this.props.record.data,
    });
  }
}
