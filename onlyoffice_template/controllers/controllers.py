# -*- coding: utf-8 -*-

#
# (c) Copyright Ascensio System SIA 2024
#

from odoo import http, SUPERUSER_ID
from odoo.http import request
from odoo.tools import file_open
from odoo.tools.translate import _

from odoo.addons.onlyoffice_odoo.utils import file_utils, jwt_utils, config_utils

import base64
import requests
import json
from datetime import datetime, date
from urllib.request import urlopen

from odoo.addons.onlyoffice_odoo.controllers.controllers import Onlyoffice_Connector
class Onlyoffice_Inherited_Connector(Onlyoffice_Connector):
    @http.route("/onlyoffice/template/editor", auth="user", methods=["POST"], type="json", csrf=False)
    def override_render_editor(self, attachment_id, access_token=None):
        attachment = self.get_attachment(attachment_id)
        if not attachment:
            return request.not_found()

        attachment.validate_access(access_token)

        data = attachment.read(["id", "checksum", "public", "name", "access_token"])[0]
        filename = data["name"]
        
        can_read = attachment.check_access_rights("read", raise_exception=False) and file_utils.can_view(filename)
        can_write = attachment.check_access_rights("write", raise_exception=False) and file_utils.can_edit(filename)

        if (not can_read):
            raise Exception("cant read")

        prepare_editor_values = self.prepare_editor_values(attachment, access_token, can_write)
        return prepare_editor_values

class OnlyofficeTemplate_Connector(http.Controller):
    #TODO: route for save docxf as pdf
    @http.route("/onlyoffice/template/upload", auth="user", methods=["POST"], type="json")
    def upload_pdf(self, data):
        try:
            data = urlopen(data["url"]).read()
            file = base64.encodebytes(data)
        except Exception as e:
            raise Exception("Error: ", str(e))
    
    @http.route("/onlyoffice/template/fill", auth="user", methods=["POST"], type="json")
    def fill_template(self, template_id, record_id, model_name):
        jwt_secret = config_utils.get_jwt_secret(request.env)
        jwt_header = config_utils.get_jwt_header(request.env)
        odoo_url = config_utils.get_odoo_url(request.env)
        docserver_url = config_utils.get_doc_server_public_url(request.env)
        internal_jwt_secret = config_utils.get_internal_jwt_secret(request.env)

        oo_security_token = jwt_utils.encode_payload(request.env, {"id": request.env.user.id}, internal_jwt_secret)
        
        record = self.get_record(template_id, "onlyoffice.template", self.get_user_from_token(oo_security_token))
        if record:
            attachment_id = record.attachment_id.id
        else:
            return {"error": "Unknown error"}

        data_url = f"{odoo_url}onlyoffice/template/callback/fill?attachment_id={attachment_id}&model_name={model_name}&record_id={record_id}&oo_security_token={oo_security_token}"
        data = {"async": False, "url": data_url}

        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if jwt_secret:
            data["token"] = jwt_utils.encode_payload(request.env, data, jwt_secret)
            headers[jwt_header] = "Bearer " + jwt_utils.encode_payload(request.env, {"payload": data}, jwt_secret)

        request_url = f"{docserver_url}docbuilder"
        try:
            response = requests.post(request_url, json=data, headers=headers)
            response.raise_for_status()
            response_json = response.json()
            urls = response_json.get("urls")
            if urls:
                first_url = next(iter(urls.values()), None)
                if first_url:
                    return {"href": first_url}
        except requests.RequestException as e:
            return {"error": f"Request failed: {e}"}

        error_code = response_json.get("error")
        if error_code:
            error_messages = {
                -1: "Unknown error.",
                -2: "Generation timeout error.",
                -3: "Document generation error.",
                -4: "Error while downloading the document file to be generated.",
                -6: "Error while accessing the document generation result database.",
                -8: "Invalid token."
            }
            return {"error": error_messages.get(error_code, "Error code not recognized.")}

        return {"error": "Unknown error"}
    
    @http.route("/onlyoffice/template/callback/fill", auth="public")
    def template_callback(self, attachment_id, model_name, record_id, oo_security_token=None):
        record_id = int(record_id)
        record = self.get_record(record_id, model_name, self.get_user_from_token(oo_security_token))
        if not record:
            return

        fields = record.fields_get_keys()
        record_values = record.read(fields)[0]

        url = f"{config_utils.get_odoo_url(http.request.env)}onlyoffice/template/download/{attachment_id}?oo_security_token={oo_security_token}"

        array_values = []
        non_array_values = []
        markup_values = []
        image_values = []
        def get_related_values(submodel_name, record_ids, depth=0):
            if depth > 3:
                return []
            records = self.get_record(record_ids, submodel_name, self.get_user_from_token(oo_security_token))
            result = []
            for record in records:
                fields = record.fields_get_keys()
                record_values = record.read(fields)[0]
                processed_record = {}
                for key, value in record_values.items():
                    field_dict = {}
                    if isinstance(value, bytes):
                        field_dict[f"{submodel_name}_{key}"] = str(value)
                        image_values.append(field_dict)
                    elif hasattr(value, "__html__"):
                        field_dict[f"{submodel_name}_{key}"] = str(value)
                        markup_values.append(field_dict)
                    elif isinstance(value, list) and value and http.request.env[submodel_name]._fields[key].type == "one2many":
                        related_model = http.request.env[submodel_name]._fields[key].comodel_name
                        get_related_values(related_model, value, depth + 1)
                    elif isinstance(value, tuple) and len(value) == 2:
                        processed_record[key] = value[1]
                    elif isinstance(value, datetime):
                        processed_record[key] = value.strftime("%Y-%m-%d %H:%M:%S")
                    elif isinstance(value, date):
                        processed_record[key] = value.strftime("%Y-%m-%d")
                    else:
                        processed_record[key] = value
                if processed_record:
                    result.append(processed_record)
            field_dict = {}
            field_dict[f"{submodel_name}"] = result
            array_values.append(field_dict)

        for key, value in record_values.items():
            processed_record = {}
            field_dict = {}

            if isinstance(value, bytes):
                field_dict[f"{model_name}_{key}"] = str(value)
                image_values.append(field_dict)
            elif hasattr(value, "__html__"):
                field_dict[f"{model_name}_{key}"] = str(value)
                markup_values.append(field_dict)
            elif isinstance(value, list) and value and http.request.env[model_name]._fields[key].type == "one2many":
                related_model = http.request.env[model_name]._fields[key].comodel_name
                get_related_values(related_model, value)
            elif isinstance(value, tuple) and len(value) == 2:
                processed_record[f"{model_name}_{key}"] = value[1]
            elif isinstance(value, datetime):
                processed_record[f"{model_name}_{key}"] = value.strftime("%Y-%m-%d %H:%M:%S")
            elif isinstance(value, date):
                processed_record[f"{model_name}_{key}"] = value.strftime("%Y-%m-%d")
            else:
                processed_record[f"{model_name}_{key}"] = value
            
            if processed_record:
                non_array_values.append(processed_record)
        
        def format_values_for_json(value):
            if isinstance(value, bool):
                return str(value).lower()
            elif value is None:
                return "null"
            elif isinstance(value, (int, float)):
                return str(value)
            return value

        formatted_non_array_values = {}
        for item in non_array_values:
            for key, value in item.items():
                formatted_non_array_values[key] = format_values_for_json(value)

        json_array_values = json.dumps(array_values, ensure_ascii=False)
        json_non_array_values = json.dumps(formatted_non_array_values, ensure_ascii=False)

        docbuilder_content = f"""
            builder.OpenFile("{url}");        
            var array_values = {json_array_values};
            var non_array_values = {json_non_array_values};
        """

        with file_open("onlyoffice_template/controllers/fill_template.docbuilder", "r") as f:
            docbuilder_content = docbuilder_content + f.read()

        model_description = http.request.env[model_name]._description + " - " or ""

        if "display_name" in record:
            record_name = record["display_name"]
        elif "name" in record:
            record_name = record["name"]
        
        filename = model_description + (record_name if record_name else "")

        if not filename:
            record_name = "Filled record - " + str(record_id)

        docbuilder_content += f"""
            builder.SaveFile("docxf", "{filename}.docx");
            builder.CloseFile();
        """

        headers = {
            "Content-Disposition": "attachment; filename='fill_template.docbuilder'",
            "Content-Type": "text/plain",
        }

        return request.make_response(docbuilder_content, headers)
    
    @http.route("/onlyoffice/template/download/<int:attachment_id>", auth="public", csrf=False)
    def download_template(self, attachment_id, oo_security_token=None):
        if request.env.user and request.env.user.id and not oo_security_token:
            internal_jwt_secret = config_utils.get_internal_jwt_secret(request.env)
            oo_security_token = jwt_utils.encode_payload(request.env, {"id": request.env.user.id}, internal_jwt_secret)

        attachment = self.get_record(attachment_id, "ir.attachment", self.get_user_from_token(oo_security_token))

        if "name" in attachment:
            attachment_name = attachment["name"]
        else:
            attachment_name = "Template.docxf"

        if attachment:
            template_content = base64.b64decode(attachment.datas)
            headers = {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": f"attachment; filename={attachment_name}",
            }
            return request.make_response(template_content, headers)
        else:
            return request.not_found()

    def get_record(self, record_id, model_name, user=None):
        if not isinstance(record_id, list):
            record_id = [record_id]
        model_name = request.env[model_name]
        if user:
            model_name = model_name.with_user(user)
        try:
            return model_name.browse(record_id).exists()
        except Exception:
            return None

    def get_user_from_token(self, token):
        if not token:
            raise Exception("missing security token")
        user_id = jwt_utils.decode_token(request.env, token, config_utils.get_internal_jwt_secret(request.env))["id"]
        user = request.env["res.users"].sudo().browse(user_id).exists().ensure_one()
        return user