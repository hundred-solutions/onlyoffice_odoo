from odoo import api, models, fields
from odoo.exceptions import UserError
import json
import re
import base64

from odoo.addons.onlyoffice_odoo.utils import file_utils

class OnlyOfficeTemplate(models.Model):
    _name = "onlyoffice.template"
    _description = "ONLYOFFICE Template"

    name = fields.Char(required=True, string="Template Name")
    template_model_id = fields.Many2one("ir.model", string="Select Model")
    template_model_name = fields.Char("Model Description", related="template_model_id.name")
    template_model_model = fields.Char("Model", related="template_model_id.model")
    file = fields.Binary(string="Upload an existing template")
    attachment_id = fields.Many2one("ir.attachment", readonly=True)
    mimetype = fields.Char(default="application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    @api.onchange("name")
    def _onchange_name(self):
        if self.attachment_id:
            self.attachment_id.name = self.name + ".docxf"
            self.attachment_id.display_name = self.name

    @api.model
    def create(self, vals):
        file = vals.get("file") or base64.encodebytes(file_utils.get_default_file_template(self.env.user.lang, "docx"))
        mimetype = file_utils.get_mime_by_ext("docx")

        vals["file"] = file
        vals["mimetype"] = mimetype

        datas = vals.pop("file", None)
        record = super(OnlyOfficeTemplate, self).create(vals)
        if datas:
            attachment = self.env["ir.attachment"].create({
                "name": vals.get("name", record.name) + ".docxf",
                "display_name": vals.get("name", record.name),
                "mimetype": vals.get("mimetype", ""),
                "datas": datas,
                "res_model": self._name,
                "res_id": record.id,
            })
            record.attachment_id = attachment.id
        return record

    @api.model
    def get_fields_for_model(self, model_name):
        processed_models = set()
        models_info_list = []

        def process_model(name):
            if name in processed_models:
                return
            processed_models.add(name)

            fullname = self.env["ir.model"].search_read([["model", "=", name]], ["name"])
            model_info = {"name": name, "fullname": fullname, "fields": []}
            fields_info = self.env[name].fields_get()

            for field_name, field_props in fields_info.items():
                field_type = field_props["type"]
                field_detail = {
                    "name": name + "_" + field_name,
                    "string": field_props.get("string", ""),
                    "type": field_type,
                }
                model_info["fields"].append(field_detail)

                if field_type == "one2many":
                    related_model_name = field_props["relation"]
                    process_model(related_model_name)

            models_info_list.append(model_info)

        process_model(model_name)
        return json.dumps(models_info_list, ensure_ascii=False)