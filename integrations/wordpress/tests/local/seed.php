<?php
$_SERVER['HTTP_HOST'] = 'localhost:8089';
require __DIR__ . '/core/wp-load.php';
$img = wp_insert_attachment( array( 'post_title' => 'Dog bed', 'post_mime_type' => 'image/jpeg', 'post_status' => 'inherit' ), 'dog-bed.jpg' );
$gut = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Dog Beds', 'post_name' => 'dog-beds', 'post_content' =>
"<!-- wp:heading {\"level\":1} --><h1 class=\"wp-block-heading\">Dog beds</h1><!-- /wp:heading -->\n\n<!-- wp:paragraph --><p>Our orthopaedic dog beds are made in Britain with memory foam for older dogs.</p><!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":1} --><h1 class=\"wp-block-heading\">Second H1</h1><!-- /wp:heading -->\n\n<!-- wp:image {\"id\":$img} --><figure class=\"wp-block-image\"><img src=\"http://localhost:8089/wp-content/uploads/dog-bed.jpg\" alt=\"\" class=\"wp-image-$img\"/></figure><!-- /wp:image -->\n\n<!-- wp:heading {\"level\":4} --><h4 class=\"wp-block-heading\">Sizes</h4><!-- /wp:heading -->\n\n<!-- wp:paragraph --><p>See our dog food guide for feeding tips.</p><!-- /wp:paragraph -->" ) );
$classic = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Contact', 'post_name' => 'contact', 'post_content' => "<p>Call us any weekday.</p>\n<h1>Contact us</h1>\n<h1>Extra</h1>\n<p>We reply within one day.</p>" ) );
$post = wp_insert_post( array( 'post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Old guide', 'post_name' => 'old-guide', 'post_content' => '<p>An old guide.</p>' ) );
update_option( 'page_on_front', $gut ); update_option( 'show_on_front', 'page' );
echo json_encode( compact( 'img', 'gut', 'classic', 'post' ) ), "\n";
