;; -*- lexical-binding: t; -*-

(TeX-add-style-hook
 "test"
 (lambda ()
   (TeX-add-to-alist 'LaTeX-provided-class-options
                     '(("article" "")))
   (TeX-add-to-alist 'LaTeX-provided-package-options
                     '(("mypreamble" "") ("MJPreamble" "")))
   (TeX-run-style-hooks
    "latex2e"
    "article"
    "art10"
    "MJPreamble"))
 :latex)

