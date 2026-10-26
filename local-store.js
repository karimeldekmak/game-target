(function () {
  "use strict";

  var storageKey = "gamers-stop-products";
  var cartStorageKey = "gamers-stop-cart";
  var activeProducts = [];
  var wiredSearchInputs = new WeakSet();
  var wiredSearchResultLists = new WeakSet();
  var scriptUrl = document.currentScript && document.currentScript.src;
  var siteRoot = new URL(".", scriptUrl || window.location.href);

  function siteUrl(path) {
    return new URL(String(path).replace(/^\/+/, ""), siteRoot).href;
  }

  function sitePath(path) {
    return new URL(String(path).replace(/^\/+/, ""), siteRoot).pathname;
  }

  function siteRelativePath() {
    var pathname = window.location.pathname;
    var rootPath = siteRoot.pathname;
    if (rootPath !== "/" && pathname.indexOf(rootPath) === 0) {
      pathname = "/" + pathname.slice(rootPath.length);
    }
    return pathname || "/";
  }

  function isSitePage(path) {
    return window.location.pathname === sitePath(path) ||
      window.location.pathname === sitePath(path + ".html");
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function priceDetails(product) {
    var price = String(product.price || "");
    var values = price.match(/\$\s*[\d,]+(?:\.\d{1,2})?/g) || [];
    var current = values.length > 1 ? values[0] : price;
    var compareAt = product.compareAtPrice || (values.length > 1 ? values[1] : "");
    if (compareAt && priceAmount(compareAt) <= priceAmount(current)) compareAt = "";
    return { current: current, compareAt: compareAt };
  }

  function priceDisplay(product, className) {
    var details = priceDetails(product);
    var price = document.createElement("span");
    price.className = className + " local-price";
    var current = document.createElement("span");
    current.className = "local-price__current";
    current.textContent = details.current;
    price.appendChild(current);
    if (details.compareAt) {
      var compareAt = document.createElement("del");
      compareAt.className = "local-price__compare";
      compareAt.textContent = details.compareAt;
      price.appendChild(compareAt);
    }
    return price;
  }

  function currentPriceText(element) {
    var price = element.cloneNode(true);
    price.querySelectorAll(".visually-hidden").forEach(function (node) {
      node.remove();
    });
    return price.textContent
      .replace(/\b(?:sale|regular|compare at)?\s*price\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function productPath(link) {
    if (!link) return "";
    var url = new URL(link.getAttribute("href"), window.location.href);
    var isProductLink = url.pathname === sitePath("product.html") || url.pathname === sitePath("index.html");
    var path = isProductLink ? url.searchParams.get("url") : url.pathname;
    var productsIndex = path ? path.indexOf("/products/") : -1;
    if (productsIndex > 0) path = path.slice(productsIndex);
    return path && path.indexOf("/products/") === 0 ? path : "";
  }

  function readProducts(documentToRead) {
    return Array.from(documentToRead.querySelectorAll(".product-item")).map(function (card) {
      var titleLink = card.querySelector(".product-item__title");
      var imageLink = card.querySelector(".product-item__image-wrapper");
      var path = productPath(titleLink) || productPath(imageLink);
      var price = card.querySelector(".product-item__price-list");
      var priceText = "";
      var compareAtPrice = "";

      if (price) {
        var currentPrice = price.querySelector(".price--highlight");
        var comparePrice = price.querySelector(".price--compare");
        var currentCopy = (currentPrice || price).cloneNode(true);
        currentCopy.querySelectorAll(".visually-hidden").forEach(function (node) {
          node.remove();
        });
        priceText = currentCopy.textContent.replace(/\s+/g, " ").trim();
        if (comparePrice) {
          var compareCopy = comparePrice.cloneNode(true);
          compareCopy.querySelectorAll(".visually-hidden").forEach(function (node) {
            node.remove();
          });
          compareAtPrice = compareCopy.textContent.replace(/\s+/g, " ").trim();
        }
      }

      var image = card.querySelector("img");
      var imageSource = image && (image.getAttribute("data-src") || image.getAttribute("src"));
      if (imageSource) {
        imageSource = imageSource.replace("{width}", "600");
        if (imageSource.indexOf("//") === 0) imageSource = window.location.protocol + imageSource;
      }

      if (!path || !titleLink || !titleLink.textContent.trim()) return null;
      return {
        path: path,
        title: titleLink.textContent.trim(),
        price: priceText || "Price unavailable",
        compareAtPrice: compareAtPrice,
        image: imageSource || "",
        description: ""
      };
    }).filter(Boolean);
  }

  function mergeProducts(first, second) {
    var products = new Map();
    first.concat(second).forEach(function (product) {
      if (product && product.path) products.set(product.path, product);
    });
    return Array.from(products.values());
  }

  function saveProducts(products) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(products));
    } catch (error) {
      console.error("Could not save the product catalog.", error);
    }
  }

  function storedProducts() {
    try {
      var value = window.localStorage.getItem(storageKey);
      var products = value ? JSON.parse(value) : [];
      return Array.isArray(products) ? products : [];
    } catch (error) {
      console.error("Could not read the product catalog.", error);
      return [];
    }
  }

  async function loadProducts() {
    var products = mergeProducts(storedProducts(), readProducts(document));
    var response = await fetch(siteUrl("product-catalog.json?v=20261022-1"), { credentials: "same-origin" });
    if (!response.ok) throw new Error("Product catalog request failed: " + response.status);
    var catalog = await response.json();
    if (!Array.isArray(catalog)) throw new Error("Product catalog has an invalid format.");
    products = mergeProducts(products, catalog);
    saveProducts(products);
    return products;
  }

  function productLink(product) {
    return siteUrl("index.html?url=" + encodeURIComponent(product.path));
  }

  function whatsAppOrderLink(cart) {
    var subtotal = 0;
    var lines = cart.map(function (item) {
      var lineTotal = priceAmount(item.price) * item.quantity;
      subtotal += lineTotal;
      return "- " + item.title + " (Qty: " + item.quantity + ") — " + item.price +
        " each, line total " + formatTotal(lineTotal);
    });
    var message = "Hello! I would like to order from Game Target:\n" + lines.join("\n") +
      "\nSubtotal: " + formatTotal(subtotal) +
      "\nPlease confirm availability and delivery details.";
    var link = document.createElement("a");
    link.href = "https://wa.me/96176054074?text=" + encodeURIComponent(message);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "button button--primary button--full local-whatsapp-link";
    link.textContent = "Contact us on WhatsApp";
    return link;
  }

  function addFloatingWhatsAppButton() {
    if (document.querySelector(".local-whatsapp-float")) return;
    var link = document.createElement("a");
    link.className = "local-whatsapp-float";
    link.href = "https://wa.me/96176054074";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", "Chat with us on WhatsApp");
    link.title = "Chat with us on WhatsApp";

    var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 32 32");
    icon.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", "M16 .8A15.1 15.1 0 0 0 3.1 23.7L1 31l7.5-2A15.2 15.2 0 1 0 16 .8zm0 27.5c-2.4 0-4.7-.6-6.7-1.9l-.5-.3-4.4 1.2 1.2-4.3-.3-.5A12.4 12.4 0 1 1 16 28.3zm6.8-9.3c-.4-.2-2.2-1.1-2.6-1.2-.3-.1-.6-.2-.8.2-.3.4-1 1.2-1.2 1.5-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3.1-1.9-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.6.2-.8l.6-.7c.2-.2.3-.4.4-.6.1-.2 0-.5 0-.7-.1-.2-.8-2-1.1-2.7-.3-.7-.6-.6-.8-.6h-.7c-.3 0-.7.1-1 .5-.4.4-1.4 1.3-1.4 3.1s1.4 3.5 1.6 3.8c.2.2 2.7 4.1 6.5 5.7.9.4 1.6.6 2.1.7.9.3 1.7.2 2.3.1.7-.1 2.2-.9 2.5-1.8.3-.9.3-1.6.2-1.8-.1-.2-.3-.3-.7-.5z");
    icon.appendChild(path);
    link.appendChild(icon);
    document.body.appendChild(link);
  }

  function addFloatingSocialButton(platform, href, label, iconPath, iconStroke) {
    var className = "local-social-float local-social-float--" + platform;
    if (document.querySelector("." + className.replace(/ /g, "."))) return;
    var link = document.createElement("a");
    link.className = className;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", label);
    link.title = label;

    var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", iconPath);
    path.setAttribute("fill", iconStroke ? "none" : "currentColor");
    if (iconStroke) {
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.8");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    }
    icon.appendChild(path);
    link.appendChild(icon);
    document.body.appendChild(link);
  }

  function addFloatingSocialButtons() {
    addFloatingSocialButton(
      "tiktok",
      "https://www.tiktok.com/@veltrixo0o?_r=1&_t=ZS-9AY8Oka8gbt",
      "Follow Game Target on TikTok",
      "M19.6 7.2a5.7 5.7 0 0 1-3.5-1.2v8.1a6.1 6.1 0 1 1-5.2-6.1v3.3a2.8 2.8 0 1 0 1.9 2.7V2h3.3a5.7 5.7 0 0 0 3.5 3.3v1.9z",
      false
    );
    addFloatingSocialButton(
      "instagram",
      "https://instagram.com/dkgame_center?dlrf=MWJhcjdjaGRhcXVmcg%3D%3D",
      "Follow Game Target on Instagram",
      "M7 2.9h10A4.1 4.1 0 0 1 21.1 7v10a4.1 4.1 0 0 1-4.1 4.1H7A4.1 4.1 0 0 1 2.9 17V7A4.1 4.1 0 0 1 7 2.9zm0 1.8A2.3 2.3 0 0 0 4.7 7v10A2.3 2.3 0 0 0 7 19.3h10a2.3 2.3 0 0 0 2.3-2.3V7A2.3 2.3 0 0 0 17 4.7H7zm5 2.1a5.2 5.2 0 1 1 0 10.4 5.2 5.2 0 0 1 0-10.4zm0 1.8a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm5.4-3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z",
      true
    );
  }

  function readCart() {
    try {
      var value = window.localStorage.getItem(cartStorageKey);
      var cart = value ? JSON.parse(value) : [];
      if (!Array.isArray(cart)) throw new Error("Saved cart has an invalid format.");
      var itemsByPath = new Map();
      cart.forEach(function (item) {
        if (!item || typeof item.path !== "string" ||
            item.path.indexOf("/products/") !== 0 ||
            typeof item.title !== "string" || !item.title.trim() ||
            typeof item.price !== "string" ||
            !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
          console.warn("Ignoring an invalid saved cart item.", item);
          return;
        }
        try {
          if (!Number.isSafeInteger(priceAmount(item.price) * item.quantity)) {
            throw new Error("Cart line total is too large.");
          }
        } catch (error) {
          console.warn("Ignoring a cart item with an invalid price or quantity.", error);
          return;
        }
        var existing = itemsByPath.get(item.path);
        if (!existing) {
          itemsByPath.set(item.path, {
            path: item.path,
            title: item.title,
            price: item.price,
            compareAtPrice: typeof item.compareAtPrice === "string" ? item.compareAtPrice : "",
            image: typeof item.image === "string" ? item.image : "",
            quantity: item.quantity
          });
          return;
        }
        var quantity = existing.quantity + item.quantity;
        if (!Number.isSafeInteger(quantity) ||
            !Number.isSafeInteger(priceAmount(item.price) * quantity)) {
          console.warn("Ignoring a duplicate cart item that exceeds the supported quantity.", item);
          return;
        }
        existing.quantity = quantity;
        existing.title = item.title;
        existing.price = item.price;
        existing.compareAtPrice = typeof item.compareAtPrice === "string" ? item.compareAtPrice : "";
        existing.image = typeof item.image === "string" ? item.image : existing.image;
      });
      return Array.from(itemsByPath.values());
    } catch (error) {
      console.error("Could not read the saved cart.", error);
      return [];
    }
  }

  function saveCart(cart) {
    try {
      cart = normalizeCart(cart);
      cart.forEach(function (item) {
        if (!Number.isSafeInteger(priceAmount(item.price) * item.quantity)) {
          throw new Error("Cart line total exceeds the supported amount.");
        }
      });
      var subtotal = cart.reduce(function (sum, item) {
        var lineTotal = priceAmount(item.price) * item.quantity;
        if (!Number.isSafeInteger(sum + lineTotal)) {
          throw new Error("Cart subtotal exceeds the supported amount.");
        }
        return sum + lineTotal;
      }, 0);
      if (!Number.isSafeInteger(subtotal)) throw new Error("Cart subtotal is invalid.");
      window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
      updateCartCount(cart);
      return true;
    } catch (error) {
      console.error("Could not save the cart.", error);
      showCartNotice("Your browser could not save the cart. Check storage settings and try again.");
      return false;
    }
  }

  function normalizeCart(cart) {
    var normalized = new Map();
    cart.forEach(function (item) {
      var existing = normalized.get(item.path);
      if (existing) {
        existing.quantity += item.quantity;
        existing.title = item.title;
        existing.price = item.price;
        existing.compareAtPrice = item.compareAtPrice || "";
        existing.image = item.image || existing.image || "";
      } else {
        normalized.set(item.path, item);
      }
    });
    return Array.from(normalized.values());
  }

  function updateCartCount(cart) {
    var count = cart.reduce(function (sum, item) { return sum + item.quantity; }, 0);
    document.querySelectorAll(".header__cart-count").forEach(function (element) {
      if (element.textContent !== String(count)) element.textContent = String(count);
    });
    renderMiniCart(cart);
  }

  function watchCartInterface() {
    if (typeof MutationObserver !== "function") return;
    var observer = new MutationObserver(function () {
      var cart = readCart();
      var count = String(cart.reduce(function (sum, item) { return sum + item.quantity; }, 0));
      document.querySelectorAll(".header__cart-count").forEach(function (element) {
        if (element.textContent !== count) element.textContent = count;
      });
      var miniCart = document.querySelector("#mini-cart");
      var content = miniCart && miniCart.querySelector(".mini-cart__content");
      if (miniCart && content &&
          (miniCart.dataset.itemCount !== count ||
           content.querySelectorAll(".local-mini-cart__item").length !== cart.length)) {
        renderMiniCart(cart);
      }
    });
    document.querySelectorAll(".header__cart-count").forEach(function (element) {
      observer.observe(element, { childList: true, characterData: true, subtree: true });
    });
    var miniCart = document.querySelector("#mini-cart");
    var content = miniCart && miniCart.querySelector(".mini-cart__content");
    if (miniCart) observer.observe(miniCart, { attributes: true, attributeFilter: ["data-item-count"] });
    if (content) observer.observe(content, { childList: true, subtree: true });
  }

  function renderMiniCart(cart) {
    var miniCart = document.querySelector("#mini-cart");
    var content = miniCart && miniCart.querySelector(".mini-cart__content");
    if (!miniCart || !content) return;
    miniCart.dataset.itemCount = String(cart.reduce(function (sum, item) {
      return sum + item.quantity;
    }, 0));
    content.replaceChildren();

    if (!cart.length) {
      content.classList.add("mini-cart__content--empty");
      var empty = document.createElement("p");
      empty.className = "local-mini-cart__empty";
      empty.textContent = "Your cart is empty";
      var shop = document.createElement("a");
      shop.href = siteUrl("");
      shop.className = "button button--primary button--full";
      shop.textContent = "Shop our products";
      content.append(empty, shop);
      return;
    }

    content.classList.remove("mini-cart__content--empty");
    var items = document.createElement("div");
    items.className = "local-mini-cart__items";
    var subtotal = 0;
    cart.forEach(function (item) {
      subtotal += priceAmount(item.price) * item.quantity;
      var row = document.createElement("div");
      row.className = "local-mini-cart__item";
      row.dataset.cartPath = item.path;
      var product = document.createElement("a");
      product.className = "local-mini-cart__product";
      product.href = productLink(item);
      if (item.image) {
        var image = document.createElement("img");
        image.src = item.image;
        image.alt = "";
        image.loading = "lazy";
        product.appendChild(image);
      }
      var details = document.createElement("span");
      details.className = "local-mini-cart__details";
      var title = document.createElement("strong");
      title.textContent = item.title;
      var quantity = document.createElement("span");
      quantity.textContent = item.quantity + " ×";
      var price = priceDisplay(item, "local-mini-cart__price");
      details.append(title, quantity, price);
      product.appendChild(details);
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "local-mini-cart__remove";
      remove.dataset.cartAction = "remove";
      remove.setAttribute("aria-label", "Remove " + item.title + " from cart");
      remove.textContent = "Remove";
      row.append(product, remove);
      items.appendChild(row);
    });

    var total = document.createElement("p");
    total.className = "local-mini-cart__subtotal";
    total.textContent = "Subtotal: " + formatTotal(subtotal);
    content.append(items, total, whatsAppOrderLink(cart));
  }

  function showCartNotice(message) {
    var notice = document.getElementById("local-cart-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "local-cart-notice";
      notice.className = "local-cart-notice";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      document.body.appendChild(notice);
    }
    notice.textContent = message;
    notice.classList.add("is-visible");
    window.clearTimeout(notice.hideTimer);
    notice.hideTimer = window.setTimeout(function () {
      notice.classList.remove("is-visible");
    }, 2600);
  }

  function addToCart(product, quantity) {
    if (!product || !product.path || !product.title || !product.price) {
      showCartNotice("This product could not be added to the cart.");
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      showCartNotice("Enter a whole-number quantity of at least 1.");
      return;
    }
    var amount = quantity;
    var cart = readCart();
    var existing = cart.find(function (item) { return item.path === product.path; });
    if (existing) {
      if (!Number.isSafeInteger(existing.quantity + amount)) {
        showCartNotice("The quantity is too large to add.");
        return;
      }
      existing.quantity += amount;
      existing.title = product.title;
      existing.price = product.price;
      existing.compareAtPrice = product.compareAtPrice || "";
      existing.image = product.image || existing.image || "";
    } else {
      cart.push({
        path: product.path,
        title: product.title,
        price: product.price,
        compareAtPrice: product.compareAtPrice || "",
        image: product.image || "",
        quantity: amount
      });
    }
    if (saveCart(cart)) showCartNotice(product.title + " added to cart.");
  }

  function addCartButton(container, product, className) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.localAdd = product.path;
    button.textContent = "Add to cart";
    container.appendChild(button);
    return button;
  }

  function productFromForm(form) {
    var path = siteRelativePath();
    var product = activeProducts.find(function (item) { return item.path === path; });
    var title = document.querySelector(".product-meta__title");
    var price = document.querySelector(".product-form__info-content .price");
    var image = document.querySelector("meta[property='og:image']");
    if (!product && title && price) {
      product = {
        path: path,
        title: title.textContent.trim(),
        price: currentPriceText(price)
      };
      if (image) product.image = image.content;
      activeProducts.push(product);
    } else if (product) {
      if (title) product.title = title.textContent.trim();
      if (price) product.price = currentPriceText(price);
      if (image && !product.image) product.image = image.content;
    }
    if (!form || !product) return null;
    return product;
  }

  function prepareProductCards() {
    document.querySelectorAll(".product-item").forEach(function (card) {
      var link = card.querySelector(".product-item__title, .product-item__image-wrapper");
      var path = productPath(link);
      var product = activeProducts.find(function (item) { return item.path === path; });
      var addButton = Array.from(card.querySelectorAll("button")).find(function (candidate) {
        return candidate.dataset.action === "add-to-cart" ||
          candidate.textContent.trim().toLocaleLowerCase() === "sold out";
      });
      if (product && addButton) {
        addButton.disabled = false;
        addButton.type = "button";
        addButton.classList.remove("button--disabled");
        addButton.classList.add("local-add-to-cart");
        addButton.dataset.localAdd = product.path;
        addButton.textContent = "Add to cart";
      } else if (product) {
        var info = card.querySelector(".product-item__info-inner") || card.querySelector(".product-item__info");
        if (info && !info.querySelector("[data-local-add]")) {
          addCartButton(info, product, "local-add-to-cart");
        }
      }
      card.querySelectorAll("button").forEach(function (candidate) {
        if (!candidate.hasAttribute("data-local-add")) candidate.remove();
      });
      card.querySelectorAll(
        ".product-item__swatch-list, select, [data-secondary-action='open-quick-view'], " +
        ".product-item__action-list a, .product-item__action-list input[type='radio']"
      ).forEach(function (optionControl) { optionControl.remove(); });
    });
  }

  function prepareProductForm() {
    var form = document.querySelector(".product-form");
    if (!form || siteRelativePath().indexOf("/products/") !== 0) return;
    var product = productFromForm(form);
    var button = form.querySelector("[data-action='add-to-cart']");
    if (product && button) {
      button.disabled = false;
      button.classList.remove("button--disabled");
      button.dataset.localAdd = product.path;
      if (typeof MutationObserver === "function") {
        new MutationObserver(function () {
          if (button.disabled) button.disabled = false;
        }).observe(button, { attributes: true, attributeFilter: ["disabled"] });
      }
    }
  }

  function wireCartControls() {
    document.addEventListener("click", function (event) {
      var target = event.target instanceof Element ? event.target : null;
      var paginationLink = target && target.closest(".pagination a[href]");
      if (paginationLink) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.location.assign(new URL(paginationLink.getAttribute("href"), window.location.href).href);
        return;
      }

      var addButton = target && target.closest("[data-local-add]");
      if (addButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        var productForm = addButton.closest(".product-form");
        var product = productForm ? productFromForm(productForm) : activeProducts.find(function (item) {
          return item.path === addButton.dataset.localAdd;
        });
        var quantityInput = productForm && productForm.querySelector("input[name='quantity']");
        addToCart(product, quantityInput ? Number(quantityInput.value) : 1);
        return;
      }

      var cartButton = target && target.closest("[data-cart-action]");
      if (!cartButton) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      var row = cartButton.closest("[data-cart-path]");
      var path = row && row.dataset.cartPath;
      var cart = readCart();
      var item = cart.find(function (entry) { return entry.path === path; });
      if (cartButton.dataset.cartAction === "clear") {
        saveCart([]);
      } else if (item && cartButton.dataset.cartAction === "remove") {
        saveCart(cart.filter(function (entry) { return entry.path !== path; }));
      } else if (item && cartButton.dataset.cartAction === "increase") {
        if (Number.isSafeInteger(item.quantity + 1)) item.quantity += 1;
        else showCartNotice("The quantity is too large to increase.");
        saveCart(cart);
      } else if (item && cartButton.dataset.cartAction === "decrease") {
        if (item.quantity > 1) item.quantity -= 1;
        saveCart(cart);
      }
      if (isSitePage("cart")) renderCart();
    }, true);

    document.addEventListener("change", function (event) {
      var input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input || !input.matches("[data-cart-quantity]")) return;
      event.stopImmediatePropagation();
      var row = input.closest("[data-cart-path]");
      if (!row) return;
      var quantity = Number(input.value);
      if (!input.validity.valid || !Number.isSafeInteger(quantity) || quantity < 1) {
        showCartNotice("Enter a whole-number quantity of at least 1.");
        renderCart();
        return;
      }
      var cart = readCart();
      var item = cart.find(function (entry) { return entry.path === row.dataset.cartPath; });
      if (item) {
        item.quantity = quantity;
        saveCart(cart);
        renderCart();
      }
    });

    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.closest(".product-item")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        var card = form.closest(".product-item");
        var cardPath = productPath(card.querySelector(".product-item__title, .product-item__image-wrapper"));
        var cardProduct = activeProducts.find(function (item) { return item.path === cardPath; });
        addToCart(cardProduct, 1);
        return;
      }
      if (!form.matches(".product-form")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      var product = productFromForm(form);
      var quantityInput = form.querySelector("input[name='quantity']");
      var quantity = quantityInput ? Number(quantityInput.value) : 1;
      addToCart(product, quantity);
    }, true);
  }

  function formatTotal(amount) {
    var dollars = Math.floor(amount / 100);
    var cents = amount % 100;
    return "$ " + dollars + (cents ? "." + String(cents).padStart(2, "0") : "");
  }

  function priceAmount(price) {
    var value = String(price).replace(/,/g, "").match(/\d+(?:\.\d{1,2})?/);
    if (!value) throw new Error("Cart item has an invalid price: " + price);
    var cents = Math.round(Number(value[0]) * 100);
    if (!Number.isSafeInteger(cents)) throw new Error("Cart item has an invalid price: " + price);
    return cents;
  }

  function renderCart() {
    var main = document.querySelector("main");
    if (!main) return;
    var cart = readCart();
    main.replaceChildren();
    var section = document.createElement("section");
    section.className = "local-cart";
    var heading = document.createElement("h1");
    heading.textContent = "Your cart";
    section.appendChild(heading);
    if (!cart.length) {
      var empty = document.createElement("p");
      empty.className = "local-cart__empty";
      empty.textContent = "Your cart is empty.";
      var shop = document.createElement("a");
      shop.className = "local-cart__button";
      shop.href = siteUrl("");
      shop.textContent = "Continue shopping";
      section.append(empty, shop);
      main.appendChild(section);
      updateCartCount(cart);
      return;
    }

    var items = document.createElement("div");
    items.className = "local-cart__items";
    var subtotal = 0;
    cart.forEach(function (item) {
      var unitPrice = priceAmount(item.price);
      var lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      var row = document.createElement("article");
      row.className = "local-cart__item";
      row.dataset.cartPath = item.path;
      if (item.image) {
        var image = document.createElement("img");
        image.src = item.image;
        image.alt = "";
        image.loading = "lazy";
        row.appendChild(image);
      }
      var details = document.createElement("div");
      details.className = "local-cart__details";
      var name = document.createElement("a");
      name.href = productLink(item);
      name.textContent = item.title;
      var price = priceDisplay(item, "local-cart__price");
      details.append(name, price);
      var controls = document.createElement("div");
      controls.className = "local-cart__controls";
      var decrease = document.createElement("button");
      decrease.type = "button";
      decrease.dataset.cartAction = "decrease";
      decrease.disabled = item.quantity <= 1;
      decrease.setAttribute("aria-label", "Decrease quantity");
      decrease.textContent = "−";
      var quantity = document.createElement("input");
      quantity.type = "number";
      quantity.min = "1";
      quantity.step = "1";
      quantity.max = String(unitPrice > 0
        ? Math.floor(Number.MAX_SAFE_INTEGER / unitPrice)
        : Number.MAX_SAFE_INTEGER);
      quantity.value = String(item.quantity);
      quantity.inputMode = "numeric";
      quantity.setAttribute("aria-label", "Quantity for " + item.title);
      quantity.dataset.cartQuantity = "true";
      var increase = document.createElement("button");
      increase.type = "button";
      increase.dataset.cartAction = "increase";
      increase.setAttribute("aria-label", "Increase quantity");
      increase.textContent = "+";
      controls.append(decrease, quantity, increase);
      var line = document.createElement("strong");
      line.className = "local-cart__line-total";
      line.textContent = formatTotal(lineTotal);
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "local-cart__remove";
      remove.dataset.cartAction = "remove";
      remove.setAttribute("aria-label", "Remove " + item.title + " from cart");
      remove.textContent = "Remove";
      details.append(controls, line, remove);
      row.appendChild(details);
      items.appendChild(row);
    });
    section.appendChild(items);
    var summary = document.createElement("div");
    summary.className = "local-cart__summary";
    var total = document.createElement("strong");
    total.textContent = "Subtotal: " + formatTotal(subtotal);
    var note = document.createElement("p");
    note.textContent = "Shipping and taxes are calculated at checkout.";
    var actions = document.createElement("div");
    actions.className = "local-cart__actions";
    var continueLink = document.createElement("a");
    continueLink.className = "local-cart__button local-cart__button--secondary";
    continueLink.href = siteUrl("");
    continueLink.textContent = "Continue shopping";
    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "local-cart__remove";
    clear.dataset.cartAction = "clear";
    clear.textContent = "Empty cart";
    actions.append(continueLink, whatsAppOrderLink(cart), clear);
    summary.append(total, note, actions);
    section.appendChild(summary);
    main.appendChild(section);
    updateCartCount(cart);
  }

  function submitSearch(form) {
    var input = form.querySelector("input[name='q']");
    var query = input ? input.value.trim() : "";
    if (!query) {
      if (input) input.focus();
      return;
    }
    var searchUrl = new URL(siteUrl("search.html"), window.location.href);
    searchUrl.searchParams.set("q", query);
    window.location.assign(searchUrl.href);
  }

  function wireSearchForms() {
    document.addEventListener("mousedown", function (event) {
      var target = event.target instanceof Element ? event.target : null;
      if (target && target.closest(".local-quick-result")) {
        event.preventDefault();
      }
    }, true);

    document.addEventListener("keydown", function (event) {
      var input = event.target;
      if (event.key !== "Enter" || event.isComposing ||
          !(input instanceof HTMLInputElement) || input.name !== "q" ||
          !input.form || !input.form.querySelector("input[name='q']")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      submitSearch(input.form);
    }, true);

    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.querySelector("input[name='q']")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      submitSearch(form);
    }, true);

    document.addEventListener("click", function (event) {
      var target = event.target instanceof Element ? event.target : null;
      var resultLink = target && target.closest(".local-quick-result");
      if (!resultLink || event.button !== 0 || event.metaKey || event.ctrlKey ||
          event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(resultLink.href);
    }, true);

    document.addEventListener("click", function (event) {
      var target = event.target instanceof Element ? event.target : null;
      var button = target && target.closest("button[type='submit'], input[type='submit']");
      var form = button && button.form;
      if (!form || !form.querySelector("input[name='q']")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      submitSearch(form);
    }, true);

    function attachSearchInputs(root) {
      var inputs = [];
      if (root instanceof HTMLInputElement) inputs.push(root);
      if (root.querySelectorAll) {
        inputs = inputs.concat(Array.from(root.querySelectorAll(".search-bar input[name='q']")));
      }
      inputs.forEach(function (input) {
        if (wiredSearchInputs.has(input) || input.name !== "q" ||
            !input.form || !input.form.classList.contains("search-bar")) return;
        wiredSearchInputs.add(input);
        function updateResults() {
          renderQuickResults(activeProducts, input.form, input.value);
        }
        input.addEventListener("input", updateResults);
        input.addEventListener("keyup", updateResults);
        input.addEventListener("change", updateResults);

        var resultsInner = input.form.querySelector(".search-bar__results-inner");
        if (resultsInner && !wiredSearchResultLists.has(resultsInner)) {
          wiredSearchResultLists.add(resultsInner);
          new MutationObserver(function () {
            if (input.value.trim() &&
                !resultsInner.querySelector(".local-quick-result, .local-quick-result__empty")) {
              renderQuickResults(activeProducts, input.form, input.value);
            }
          }).observe(resultsInner, { childList: true });
        }
      });
    }

    attachSearchInputs(document);
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(attachSearchInputs);
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function renderQuickResults(products, form, query) {
    var results = form.querySelector(".search-bar__results");
    var resultsInner = form.querySelector(".search-bar__results-inner");
    if (!results || !resultsInner) return;

    var terms = query.trim().split(/\s+/).map(normalizeSearchText).filter(Boolean);
    resultsInner.replaceChildren();
    if (!terms.length) {
      results.setAttribute("aria-hidden", "true");
      return;
    }

    var matches = products.filter(function (product) {
      var text = normalizeSearchText(product.title + " " + product.path);
      return terms.every(function (term) { return text.indexOf(term) !== -1; });
    }).slice(0, 6);

    matches.forEach(function (product) {
      var link = document.createElement("a");
      link.className = "local-quick-result";
      link.href = productLink(product);
      if (product.image) {
        var image = document.createElement("img");
        image.src = product.image;
        image.alt = "";
        image.loading = "lazy";
        link.appendChild(image);
      }
      var info = document.createElement("span");
      info.className = "local-quick-result__info";
      var title = document.createElement("span");
      title.className = "local-quick-result__title";
      title.textContent = product.title;
      var price = priceDisplay(product, "local-quick-result__price");
      info.append(title, price);
      link.appendChild(info);
      resultsInner.appendChild(link);
    });

    if (!matches.length) {
      var empty = document.createElement("p");
      empty.className = "local-quick-result__empty";
      empty.textContent = "No matching products found.";
      resultsInner.appendChild(empty);
    }

    results.setAttribute("aria-hidden", "false");
  }

  function prepareProductLinks() {
    document.querySelectorAll(".product-item a[href]").forEach(function (link) {
      var path = productPath(link);
      if (path) link.href = productLink({ path: path });
    });
  }

  function addStyles() {
    if (document.getElementById("local-store-styles")) return;
    if (isSitePage("search")) {
      document.documentElement.classList.add("local-search-page");
    }
    var style = document.createElement("style");
    style.id = "local-store-styles";
    style.textContent = [
      ".nav-bar__linklist{justify-content:center;padding:8px 0}",
      ".nav-bar__linklist>.nav-bar__item>.nav-bar__link,.mobile-menu__nav>.mobile-menu__nav-item>.mobile-menu__nav-link{box-sizing:border-box;display:inline-flex;min-height:42px;align-items:center;justify-content:center;padding:10px 28px;border:1px solid #38d9ff;border-radius:8px;background:linear-gradient(110deg,#14205d 0%,#204ac1 52%,#087eae 100%);color:#fff!important;font-weight:700;letter-spacing:.1em;text-decoration:none;text-transform:uppercase;box-shadow:inset 0 1px 0 #ffffff2e,0 0 16px #1e90ff55;transition:background 180ms ease,border-color 180ms ease,box-shadow 180ms ease,transform 180ms ease}",
      ".nav-bar__linklist>.nav-bar__item>.nav-bar__link:hover,.mobile-menu__nav>.mobile-menu__nav-item>.mobile-menu__nav-link:hover{border-color:#9af0ff;background:linear-gradient(110deg,#1a2b78 0%,#2862eb 52%,#079fcf 100%);box-shadow:inset 0 1px 0 #ffffff3d,0 0 22px #1ea6ff8c;transform:translateY(-2px)}",
      ".header__action-item--account{display:none!important}",
      "@media(max-width:1024px){.nav-bar__linklist{padding:6px 12px}}",
      ".local-search-results{padding:28px 20px;max-width:1200px;margin:0 auto}",
      "html.local-search-page .search-bar__inner{display:none!important}",
      "#shopify-section-slideshow{margin-top:16px}",
      ".local-search-results h1{margin:0 0 22px;font-size:30px}",
      ".local-search-pagination{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:8px;margin:28px 0}",
      ".local-search-pagination a,.local-search-pagination span{display:inline-flex;min-width:40px;min-height:40px;align-items:center;justify-content:center;padding:8px 12px;border:1px solid #e1e3e4;color:#1e2d7d;text-decoration:none}",
      ".local-search-pagination a:hover{border-color:#1e2d7d;background:#f3f5f6}",
      ".local-search-pagination [aria-current=page]{border-color:#1e2d7d;background:#1e2d7d;color:#fff}",
      ".local-product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:20px}",
      ".local-product-card{display:flex;flex-direction:column;color:inherit;border:1px solid #e1e3e4;padding:12px;background:#fff}",
      ".local-product-card:hover{box-shadow:0 3px 14px #0002}",
      ".local-product-card__link{display:flex;flex:1;flex-direction:column;color:inherit;text-decoration:none}",
      ".local-product-card img{width:100%;height:190px;object-fit:contain}",
      ".local-product-card__title{display:block;margin:10px 0;font-weight:600}",
      ".local-product-card__price{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 8px;color:#db0000;font-weight:700}",
      ".local-price{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 8px}",
      ".local-price__current{color:#db0000;font-weight:700}",
      ".local-price__compare{color:#85858e;font-size:.88em;font-weight:400;text-decoration:line-through;text-decoration-thickness:1.5px}",
      ".price--compare{color:#85858e!important;text-decoration:line-through;text-decoration-thickness:1.5px}",
      ".local-add-to-cart{display:block;width:100%;margin-top:10px;padding:11px 14px;min-height:46px;border:1px solid #38d9ff!important;border-radius:6px;background:linear-gradient(110deg,#14205d 0%,#204ac1 52%,#087eae 100%)!important;color:#fff!important;font:inherit;font-weight:600;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;box-shadow:inset 0 1px 0 #ffffff2e,0 0 14px #1e90ff3d;transition:background 180ms ease,border-color 180ms ease,box-shadow 180ms ease,transform 180ms ease!important}",
      ".local-add-to-cart:hover:not(:disabled){border-color:#9af0ff!important;background:linear-gradient(110deg,#1a2b78 0%,#2862eb 52%,#079fcf 100%)!important;color:#fff!important;box-shadow:inset 0 1px 0 #ffffff3d,0 0 22px #1ea6ff8c;transform:translateY(-2px)}",
      ".local-add-to-cart:active:not(:disabled){transform:translateY(0);box-shadow:inset 0 2px 6px #0005,0 0 10px #1ea6ff52}",
      ".local-add-to-cart:disabled{border-color:#3a3a42!important;background:#27272c!important;color:#a7a7af!important;box-shadow:none;transform:none;cursor:not-allowed}",
      ".local-quick-result{box-sizing:border-box;display:flex;align-items:center;gap:12px;width:100%;padding:10px;border-bottom:1px solid #e1e3e4;color:inherit;text-decoration:none}",
      ".local-quick-result:hover{background:#f3f5f6}",
      ".local-quick-result img{width:52px;height:52px;object-fit:contain;flex:none}",
      ".local-quick-result__info{display:flex;flex:1;flex-direction:column;align-items:flex-start;gap:4px;min-width:0}",
      ".local-quick-result__title{max-width:100%;font-weight:600;overflow-wrap:anywhere}",
      ".local-quick-result__price{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 8px;color:#db0000;font-weight:700}",
      ".local-quick-result__empty{padding:12px}",
      ".local-search-empty{padding:24px 0}",
      ".local-product-detail{max-width:1100px;margin:40px auto;padding:24px;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,1fr);gap:40px}",
      ".local-product-detail img{display:block;width:100%;max-height:600px;object-fit:contain}",
      ".local-product-detail__price{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 10px;margin:12px 0;font-size:24px;font-weight:700;color:#db0000}",
      ".local-product-detail__description{line-height:1.7}",
      ".local-product-detail__back{display:inline-block;margin:24px}",
      ".local-cart{max-width:900px;margin:36px auto;padding:20px}",
      ".local-cart h1{margin:0 0 24px}",
      ".local-cart__items{border-top:1px solid #e1e3e4}",
      ".local-cart__item{display:flex;align-items:center;gap:18px;padding:18px 0;border-bottom:1px solid #e1e3e4}",
      ".local-cart__item>img{width:90px;height:90px;object-fit:contain;flex:none}",
      ".local-cart__details{display:grid;flex:1;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px 20px}",
      ".local-cart__details>a{color:#1e2d7d;font-weight:600}",
      ".local-cart__details p{margin:4px 0 0}",
      ".local-cart__price{grid-column:1/-1;margin:4px 0 0}",
      ".local-cart__controls{display:flex;align-items:center;gap:8px}",
      ".local-cart__controls button,.local-cart__controls input{box-sizing:border-box;width:38px;height:36px;text-align:center}",
      ".local-cart__controls button{border:1px solid #d4d6d8;background:#fff;cursor:pointer;font-size:20px}",
      ".local-cart__controls button:disabled{opacity:.45;cursor:not-allowed}",
      ".local-cart__controls input{border:1px solid #d4d6d8}",
      ".local-cart__line-total{justify-self:end}",
      ".local-cart__remove{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:7px 12px;border:1px solid #b00000;border-radius:3px;background:#fff;color:#b00000;text-decoration:none;cursor:pointer;font:inherit;font-weight:600;justify-self:start}",
      ".local-cart__remove:hover{background:#b00000;color:#fff}",
      ".local-cart__summary{margin:24px 0 0 auto;max-width:380px;text-align:right}",
      ".local-cart__summary>strong{font-size:20px}",
      ".local-cart__summary p{color:#677279}",
      ".local-cart__actions{display:flex;justify-content:flex-end;align-items:center;gap:16px;margin-top:18px}",
      ".local-cart__button{display:inline-block;padding:12px 18px;background:#1e2d7d;color:#fff;text-decoration:none;font-weight:600}",
      ".local-cart__button--secondary{background:#f3f5f6;color:#1e2d7d}",
      ".local-cart__empty{margin:0 0 20px}",
      ".local-mini-cart__empty{margin:16px;text-align:center}",
      ".local-mini-cart__items{max-height:300px;overflow:auto}",
      ".local-mini-cart__item{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #e1e3e4}",
      ".local-mini-cart__price{display:inline-flex;align-items:baseline;gap:0 6px;flex-wrap:wrap}",
      ".local-mini-cart__product{display:flex;flex:1;min-width:0;align-items:center;gap:12px;color:inherit;text-decoration:none}",
      ".local-mini-cart__product img{width:54px;height:54px;object-fit:contain;flex:none}",
      ".local-mini-cart__details{display:flex;min-width:0;flex-direction:column;gap:4px}",
      ".local-mini-cart__details strong{font-weight:600}",
      ".local-mini-cart__remove{flex:none;padding:6px 8px;border:1px solid #b00000;border-radius:3px;background:#fff;color:#b00000;cursor:pointer;font:inherit;font-size:12px;font-weight:600}",
      ".local-mini-cart__remove:hover{background:#b00000;color:#fff}",
      ".local-mini-cart__subtotal{margin:14px 16px;font-weight:700;text-align:right}",
      ".local-whatsapp-link{box-sizing:border-box;text-align:center;text-decoration:none}",
      ".local-whatsapp-float{position:fixed;z-index:100000;right:20px;bottom:20px;display:flex;width:58px;height:58px;align-items:center;justify-content:center;border-radius:50%;background:#25d366;color:#fff;box-shadow:0 3px 12px #0004;text-decoration:none;transition:transform .2s,background-color .2s}",
      ".local-whatsapp-float:hover{transform:scale(1.07);background:#1fbd5b}",
      ".local-whatsapp-float:focus-visible{outline:3px solid #1e2d7d;outline-offset:3px}",
      ".local-whatsapp-float svg{width:34px;height:34px}",
      ".local-social-float{position:fixed;z-index:100000;right:20px;display:flex;width:58px;height:58px;align-items:center;justify-content:center;border-radius:50%;color:#fff;box-shadow:0 3px 12px #0004;text-decoration:none;transition:transform .2s,filter .2s}",
      ".local-social-float:hover{transform:scale(1.07);filter:brightness(.92)}",
      ".local-social-float:focus-visible{outline:3px solid #1e2d7d;outline-offset:3px}",
      ".local-social-float svg{width:30px;height:30px}",
      ".local-social-float--instagram{bottom:88px;background:radial-gradient(circle at 30% 110%,#fdf497 0%,#fdf497 5%,#fd5949 45%,#d6249f 60%,#285aeb 90%)}",
      ".local-social-float--tiktok{bottom:156px;background:#111}",
      ".local-cart-notice{position:fixed;z-index:99999;right:18px;bottom:18px;max-width:min(420px,calc(100vw - 36px));padding:14px 18px;background:#1e2d7d;color:#fff;box-shadow:0 4px 16px #0003;opacity:0;pointer-events:none;transform:translateY(10px);transition:opacity .2s,transform .2s}",
      ".local-cart-notice.is-visible{opacity:1;transform:translateY(0)}",
      "@media(max-width:640px){.local-product-detail{grid-template-columns:1fr;margin:16px auto;padding:16px}.local-product-card img{height:150px}.local-cart{padding:14px}.local-cart__item{align-items:flex-start;gap:10px}.local-cart__item>img{width:64px;height:64px}.local-cart__details{grid-template-columns:minmax(0,1fr);gap:8px}.local-cart__line-total{justify-self:start}.local-cart__actions{flex-wrap:wrap;justify-content:flex-start}.local-mini-cart__item{padding:10px}.local-mini-cart__product{gap:8px}.local-mini-cart__product img{width:44px;height:44px}}"
    ].join("");
    style.textContent += "@media(max-width:640px){.local-cart{margin:16px auto;padding:16px}.local-cart__item{align-items:flex-start;gap:12px}.local-cart__item>img{width:64px;height:64px}.local-cart__details{grid-template-columns:1fr;gap:10px}.local-cart__line-total{justify-self:start}.local-cart__summary{max-width:none}.local-cart__actions{flex-wrap:wrap}}";
    style.textContent += "@media(max-width:640px){.local-whatsapp-float{right:16px;bottom:calc(16px + env(safe-area-inset-bottom));width:54px;height:54px}.local-whatsapp-float svg{width:31px;height:31px}}";
    style.textContent += "@media(max-width:640px){.local-social-float{right:16px;width:54px;height:54px}.local-social-float--instagram{bottom:calc(84px + env(safe-area-inset-bottom))}.local-social-float--tiktok{bottom:calc(148px + env(safe-area-inset-bottom))}.local-social-float svg{width:28px;height:28px}}";
    document.head.appendChild(style);
  }

  function simplifyNavigation() {
    document.querySelectorAll(".nav-bar__linklist, .mobile-menu__nav").forEach(function (list) {
      Array.from(list.children).forEach(function (item) {
        var homeLink = item.querySelector("a");
        if (!homeLink || homeLink.textContent.trim().toLocaleLowerCase() !== "home") {
          item.remove();
        }
      });
    });
    document.querySelectorAll(".header__action-item--account").forEach(function (item) {
      item.remove();
    });
  }

  function prepareSiteLinks() {
    document.querySelectorAll("a[href], form[action]").forEach(function (element) {
      var attribute = element instanceof HTMLFormElement ? "action" : "href";
      var value = element.getAttribute(attribute);
      if (value && value.indexOf("./") === 0) {
        element.setAttribute(attribute, siteUrl(value.slice(2)));
      }
    });
  }

  function renderSearch(products) {
    var query = new URLSearchParams(window.location.search).get("q") || "";
    var normalizedQuery = normalizeSearchText(query);
    var searchTerms = query.trim().split(/\s+/).map(normalizeSearchText).filter(Boolean);
    document.querySelectorAll(".search-bar input[name='q']").forEach(function (input) {
      input.value = query;
    });
    var matches = normalizedQuery ? products.filter(function (product) {
      var searchableText = normalizeSearchText(product.title + " " + product.path);
      return searchTerms.every(function (term) {
        return searchableText.indexOf(term) !== -1;
      });
    }) : [];
    matches.sort(function (first, second) {
      var firstTitle = normalizeSearchText(first.title);
      var secondTitle = normalizeSearchText(second.title);
      var firstStarts = firstTitle.indexOf(normalizedQuery) === 0 ? 0 : 1;
      var secondStarts = secondTitle.indexOf(normalizedQuery) === 0 ? 0 : 1;
      return firstStarts - secondStarts || firstTitle.localeCompare(secondTitle);
    });
    var pageSize = 24;
    var totalPages = Math.ceil(matches.length / pageSize);
    var requestedPage = Number(new URLSearchParams(window.location.search).get("page"));
    var currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    currentPage = Math.min(currentPage, Math.max(totalPages, 1));
    var pageMatches = matches.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    var main = document.querySelector("main");
    if (!main) return;

    main.replaceChildren();
    var section = document.createElement("section");
    section.className = "local-search-results";
    var heading = document.createElement("h1");
    heading.textContent = normalizedQuery ? "Search results for: " + query.trim() : "Search products";
    section.appendChild(heading);

    if (!normalizedQuery) {
      var prompt = document.createElement("p");
      prompt.className = "local-search-empty";
      prompt.textContent = "Enter a product name in the search box above.";
      section.appendChild(prompt);
    } else if (!matches.length) {
      var empty = document.createElement("p");
      empty.className = "local-search-empty";
      empty.textContent = "No products found. Try another search.";
      section.appendChild(empty);
    } else {
      var grid = document.createElement("div");
      grid.className = "local-product-grid";
      pageMatches.forEach(function (product) {
        var card = document.createElement("article");
        card.className = "local-product-card";
        var link = document.createElement("a");
        link.className = "local-product-card__link";
        link.href = productLink(product);
        if (product.image) {
          var image = document.createElement("img");
          image.src = product.image;
          image.alt = product.title;
          image.loading = "lazy";
          link.appendChild(image);
        }
        var title = document.createElement("span");
        title.className = "local-product-card__title";
        title.textContent = product.title;
        var price = priceDisplay(product, "local-product-card__price");
        link.append(title, price);
        card.appendChild(link);
        addCartButton(card, product, "local-add-to-cart");
        grid.appendChild(card);
      });
      section.appendChild(grid);

      if (totalPages > 1) {
        var pagination = document.createElement("nav");
        pagination.className = "local-search-pagination";
        pagination.setAttribute("aria-label", "Search result pages");

        if (currentPage > 1) {
          var previous = document.createElement("a");
          previous.href = siteUrl("search.html?q=" + encodeURIComponent(query) + "&page=" + (currentPage - 1));
          previous.textContent = "Previous";
          pagination.appendChild(previous);
        }

        for (var pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
          if (pageNumber === currentPage) {
            var activePage = document.createElement("span");
            activePage.setAttribute("aria-current", "page");
            activePage.textContent = String(pageNumber);
            pagination.appendChild(activePage);
          } else {
            var pageLink = document.createElement("a");
            pageLink.href = siteUrl("search.html?q=" + encodeURIComponent(query) + "&page=" + pageNumber);
            pageLink.textContent = String(pageNumber);
            pageLink.setAttribute("aria-label", "Page " + pageNumber);
            pagination.appendChild(pageLink);
          }
        }

        if (currentPage < totalPages) {
          var next = document.createElement("a");
          next.href = siteUrl("search.html?q=" + encodeURIComponent(query) + "&page=" + (currentPage + 1));
          next.textContent = "Next";
          pagination.appendChild(next);
        }
        section.appendChild(pagination);
      }
    }
    main.appendChild(section);
    document.title = normalizedQuery ? "Search: " + query.trim() + " | Game Target" : "Search | Game Target";
  }

  async function renderProduct(products) {
    var path = new URLSearchParams(window.location.search).get("url") || "";
    if (path.charAt(0) !== "/" || path.indexOf("/products/") !== 0) {
      throw new Error("Product page URL is missing or invalid.");
    }
    var product = products.find(function (item) { return item.path === path; });
    if (!product && document.referrer) {
      var referrer = new URL(document.referrer);
      if (referrer.origin === window.location.origin) {
        var sourceResponse = await fetch(referrer.href, { credentials: "same-origin" });
        if (sourceResponse.ok) {
          var sourcePage = new DOMParser().parseFromString(await sourceResponse.text(), "text/html");
          product = readProducts(sourcePage).find(function (item) { return item.path === path; });
        }
      }
    }

    if (!product) {
      try {
        var response = await fetch(siteUrl(path), { credentials: "same-origin" });
        if (response.ok) {
          var productPage = new DOMParser().parseFromString(await response.text(), "text/html");
          var description = productPage.querySelector(".product-block-list__item--description .rte");
          var actualTitle = productPage.querySelector(".product-meta__title");
          var price = productPage.querySelector(".product-form__info-content .price");
          var comparePrice = productPage.querySelector(".product-form__info-content .price--compare");
          var image = productPage.querySelector("meta[property='og:image']");
          product = {
            path: path,
            title: actualTitle ? actualTitle.textContent.trim() : "",
            price: price ? price.textContent.replace(/\s+/g, " ").trim() : "",
            image: image ? image.content : "",
            description: ""
          };
          if (description) product.description = description.textContent.replace(/\s+/g, " ").trim();
          if (actualTitle) product.title = actualTitle.textContent.trim();
          if (price) {
            var priceCopy = price.cloneNode(true);
            priceCopy.querySelectorAll(".visually-hidden").forEach(function (node) {
              node.remove();
            });
            product.price = priceCopy.textContent.replace(/\s+/g, " ").trim();
          }
          if (comparePrice) {
            var compareCopy = comparePrice.cloneNode(true);
            compareCopy.querySelectorAll(".visually-hidden").forEach(function (node) {
              node.remove();
            });
            product.compareAtPrice = compareCopy.textContent.replace(/\s+/g, " ").trim();
          }
          if (!product.image && image) product.image = image.content;
        }
      } catch (error) {
        console.warn("Could not load extended product details; showing catalog information.", error);
      }
    }
    if (!product) throw new Error("Product was not found in the catalog or the referring collection.");
    if (!product.title || !product.price) {
      throw new Error("Product title or price is missing from the available product data.");
    }

    var main = document.querySelector("main") || document.body;
    main.replaceChildren();
    var back = document.createElement("a");
    back.className = "local-product-detail__back";
    back.href = siteUrl("");
    back.textContent = "Back to shopping";
    main.appendChild(back);

    var detail = document.createElement("article");
    detail.className = "local-product-detail";
    if (product.image) {
      var image = document.createElement("img");
      image.src = product.image;
      image.alt = product.title;
      detail.appendChild(image);
    }
    var info = document.createElement("div");
    var title = document.createElement("h1");
    title.textContent = product.title;
    var price = priceDisplay(product, "local-product-detail__price");
    info.append(title, price);
    if (product.description) {
      var description = document.createElement("p");
      description.className = "local-product-detail__description";
      description.textContent = product.description;
      info.appendChild(description);
    }
    addCartButton(info, product, "local-add-to-cart");
    detail.appendChild(info);
    main.appendChild(detail);
    document.title = product.title + " | Game Target";
  }

  async function initialize() {
    // Shopify's cart refresh requires a backend; the local cart is refreshed below.
    window.onpageshow = null;
    addStyles();
    simplifyNavigation();
    prepareSiteLinks();
    wireSearchForms();
    wireCartControls();
    addFloatingWhatsAppButton();
    addFloatingSocialButtons();
    updateCartCount(readCart());
    watchCartInterface();
    if (isSitePage("cart")) renderCart();
    window.addEventListener("pageshow", function () {
      var cart = readCart();
      updateCartCount(cart);
      if (isSitePage("cart")) renderCart();
    });
    window.addEventListener("storage", function (event) {
      if (event.key !== cartStorageKey && event.key !== null) return;
      var cart = readCart();
      updateCartCount(cart);
      if (isSitePage("cart")) renderCart();
    });
    try {
      var products = await loadProducts();
      activeProducts = products;
      prepareProductLinks();
      prepareProductCards();
      prepareProductForm();
      updateCartCount(readCart());
      document.querySelectorAll(".search-bar input[name='q']").forEach(function (input) {
        if (input.value.trim()) renderQuickResults(activeProducts, input.form, input.value);
      });
      if (isSitePage("cart")) {
        renderCart();
      } else if (window.location.pathname === sitePath("product.html") ||
        (window.location.pathname === sitePath("index.html") &&
          new URLSearchParams(window.location.search).has("url"))) {
        await renderProduct(products);
      } else if (isSitePage("search") ||
        (window.location.pathname === sitePath("index.html") &&
          new URLSearchParams(window.location.search).has("q"))) {
        renderSearch(products);
      }
    } catch (error) {
      console.error("The product catalog could not be loaded.", error);
      if (isSitePage("cart")) return;
      var main = document.querySelector("main") || document.body;
      var message = document.createElement("p");
      message.className = "local-search-empty";
      message.textContent = "Products could not be loaded. Please refresh and try again.";
      main.appendChild(message);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
