(async () => {
    let $section = document.querySelector(".options");
    let $form = document.querySelector("form.options");
    let $save = $form.querySelector(".save");
    let $message = document.querySelector("form .message");

    if (document.fragmentDirective) {
        $form.setAttribute("data-native-supported", "1");
    }

    $form.addEventListener("change", (event) => {
        event.preventDefault();
        $save.disabled = false;
    });

    self.addEventListener("beforeunload", (event) => {
        if (!$save.disabled) {
            event.preventDefault();
            return (event.returnValue = "");
        }
    });

    let getFormData = () => {
        let settings = {};
        [...$section.querySelectorAll("[data-setting]")].map((n) => {
            settings[n.getAttribute("data-setting")] = n.type == "checkbox" ? n.checked : n.value
        });
        return settings;
    };
    let setFormData = (o) => {
        for (let k in o) {
            let n = $section.querySelector(`[data-setting="${k}"]`);
            if (!n) continue;
            let v = o[k];
            if (n.type == "checkbox") {
                n.checked = !!v;
            } else {
                n.value = v;
            }
        }
    };

    $save.onclick = async function (event) {
        if (!$form.checkValidity()) {
            $form.reportValidity();
            return false;
        }
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1385548
        // $message.classList.remove('timeout');
        $message.textContent = "";
        try {
            await util.setSettings(getFormData());
            this.disabled = true;
        } catch (e) {
            console.error(e);
            $message.textContent = "" + e;
            // throw e;
        } finally {
            // setTimeout(() => $message.classList.add('timeout'), 200);
        }
    }
    $section.onkeydown = (event) => {
        if (event.ctrlKey && event.key == "s") {
            $save.click();
            event.preventDefault();
        }
    }

    setFormData(await util.getSettings(Object.keys(getFormData())));
    $save.disabled = true;

    try {
        if ((!!self.document.fragmentDirective) != (!!(await browser.runtime.getBackgroundPage()).document.fragmentDirective)) {
            $message.textContent = "Reloading...";
            setTimeout(() => {
                browser.runtime.reload();
            }, 1000)
        }
    } catch (e) {
        console.warn(e);
    }

})();
